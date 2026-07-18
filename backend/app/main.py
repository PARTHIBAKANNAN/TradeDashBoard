"""
FastAPI Backend-For-Frontend.

Ingests millisecond ticks in-memory (via DataEngine), then batches the fully
computed state of the whole watchlist into a single JSON payload pushed to the
browser exactly once per `STREAM_INTERVAL` second over Server-Sent Events.

No broker credentials or raw broker sockets are ever exposed to the client.
A built-in login (session cookie) gates the dashboard; FYERS account auth is
handled separately via /callback + /api/auth/*.
"""
import asyncio
import json
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from . import auth, config, security
from .calculations import range_map
from .fyers_service import data_engine
from .scheduler import ensure_engine_running, init_scheduler, is_market_open, shutdown_scheduler
from .state import market_state


def build_payload() -> dict:
    """Snapshot the shared state (under lock) and package the client payload."""
    with market_state.lock():
        nifty = dict(market_state.nifty)
        stocks_snapshot = [dict(s) for s in market_state.stocks.values()]
        market_open = market_state.market_open

    stocks = []
    for s in stocks_snapshot:
        ranges = range_map(
            s["yesterday_low"], s["yesterday_high"], s["today_low"], s["today_high"], s["ltp"]
        )
        stocks.append(
            {
                "symbol": s["symbol"],
                "sector": s["sector"],
                "ltp": s["ltp"],
                "pct_change": s["pct_change"],
                "relative_strength": s["relative_strength"],
                "day_range_pos": s["day_range_pos"],
                "signal": s["signal"],
                "signal_time": s["signal_time"],
                "volume": s["volume"],
                "traded_value": round(s["ltp"] * s["volume"], 2),
                "upper_ckt": s["upper_ckt"],
                "lower_ckt": s["lower_ckt"],
                "tot_buy_qty": s["tot_buy_qty"],
                "tot_sell_qty": s["tot_sell_qty"],
                "ranges": ranges,
            }
        )

    return {
        "market_open": market_open,
        "fyers_connected": auth.auth_status()["authenticated"],
        "nifty": nifty,
        "stocks": stocks,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run the (blocking) scheduler bootstrap off the event loop.
    await asyncio.to_thread(init_scheduler)
    yield
    shutdown_scheduler()


app = FastAPI(title="Live Stock Scanning BFF", lifespan=lifespan)

# Session cookie must be added before CORS so CORS stays outermost.
app.add_middleware(SessionMiddleware, secret_key=config.SESSION_SECRET, same_site="lax")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_login(request: Request):
    """Dependency: 401 unless the request carries a valid dashboard session."""
    if not security.is_authenticated(request):
        raise HTTPException(status_code=401, detail="login required")


# ----------------- dashboard login (Supabase-verified; session cookie) -----------------
class Credentials(BaseModel):
    access_token: str


@app.post("/api/auth/login")
async def login(creds: Credentials, request: Request):
    user = security.authenticate(creds.access_token)
    if not user:
        raise HTTPException(status_code=401, detail="invalid credentials")
    request.session["user"] = user
    return {"authenticated": True, "user": user}


@app.post("/api/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"authenticated": False}


@app.get("/api/auth/me")
async def me(request: Request):
    """Public: lets the SPA decide whether to show the login screen."""
    user = request.session.get("user")
    return {"authenticated": security.is_authenticated(request), "user": user}


# ----------------- FYERS account auth (admin-only) -----------------
@app.get("/api/auth/status", dependencies=[Depends(require_login)])
async def fyers_status():
    return auth.auth_status()


@app.get("/api/auth/login-url", dependencies=[Depends(require_login)])
async def fyers_login_url():
    return {"url": auth.build_login_url()}


@app.get("/callback", response_class=HTMLResponse)
async def fyers_callback(request: Request):
    """FYERS redirects here after browser authorization; auto-capture the code."""
    auth_code = request.query_params.get("auth_code")
    if not auth_code:
        return HTMLResponse(_callback_html(False, "No auth_code in the redirect."), status_code=400)
    token = auth.exchange_and_cache(auth_code)
    if not token:
        return HTMLResponse(_callback_html(False, "Token exchange failed. Check server logs."), status_code=400)
    data_engine.set_token(token)
    # Bring the data engine up now if the market is open.
    ensure_engine_running()
    return HTMLResponse(_callback_html(True, "FYERS connected. You can close this tab."))


def _callback_html(ok: bool, msg: str) -> str:
    color = "#22c55e" if ok else "#ef4444"
    title = "Connected" if ok else "Login failed"
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
<style>body{{background:#09090b;color:#e7e7ea;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0}}
.card{{border:1px solid #26262c;border-radius:14px;padding:28px 34px;text-align:center;background:#131318}}
h1{{color:{color};margin:0 0 8px}}a{{color:#3b82f6}}</style></head>
<body><div class="card"><h1>{title}</h1><p>{msg}</p><p><a href="/">Back to dashboard</a></p></div></body></html>"""


# ----------------- data routes (login-gated) -----------------
@app.get("/api/health")
async def health():
    return {"status": "ok", "market_open": is_market_open(), **auth.auth_status()}


@app.get("/api/snapshot", dependencies=[Depends(require_login)])
async def snapshot():
    return build_payload()


@app.get("/api/stream", dependencies=[Depends(require_login)])
async def stream(request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            payload = build_payload()
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(config.STREAM_INTERVAL)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # disable proxy buffering for true streaming
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


# ----------------- serve the built React app same-origin (prod) -----------------
_DIST = config.FRONTEND_DIST
_INDEX = os.path.join(_DIST, "index.html")
if os.path.isdir(_DIST) and os.path.isfile(_INDEX):
    assets_dir = os.path.join(_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        # Never let the SPA fallback swallow API/callback routes.
        if full_path.startswith("api/") or full_path == "callback":
            return JSONResponse({"detail": "not found"}, status_code=404)
        return FileResponse(_INDEX)
else:
    print(f"[main] Frontend dist not found at {_DIST}; not serving SPA (dev mode / Vite proxy).")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, reload=False)
