"""
FastAPI Backend-For-Frontend.

Ingests millisecond ticks in-memory (via DataEngine), then a single Broadcaster
task fans a diffed JSON frame out to all WebSocket subscribers every
`STREAM_INTERVAL` seconds. No broker credentials or raw broker sockets are
ever exposed to the client. A built-in login (session cookie) gates the
dashboard; FYERS account auth is handled separately via /callback + /api/auth/*.
"""

import asyncio
import json as _json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import (Depends, FastAPI, HTTPException, Request, WebSocket,
                     WebSocketDisconnect)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from .logging_config import configure_logging

configure_logging()

from . import (auth, candle_history, charts, config, paper_trading, security,
               smart_money)
from .broadcaster import Broadcaster, build_frame, snapshot_from_state
from .fyers_service import data_engine
from .scheduler import (ensure_engine_running, init_scheduler, is_market_open,
                        shutdown_scheduler)
from .state import market_state

logger = logging.getLogger(__name__)


def _live_snapshot() -> dict:
    """Snapshot provider for the Broadcaster: reads state + patches fyers flag."""
    snap = snapshot_from_state(market_state)
    is_auth = bool(auth.auth_status()["authenticated"])
    # Outside active market hours (e.g. 08:45-09:15 AM pre-market), valid auth is sufficient
    # During market hours (09:15-15:30), data_engine socket must also be actively running
    snap["fyers_connected"] = (
        is_auth if not market_state.market_open else bool(is_auth and data_engine.running)
    )
    return snap


broadcaster = Broadcaster(
    snapshot_provider=_live_snapshot,
    interval=config.STREAM_INTERVAL,
    max_queue=config.BROADCAST_MAX_QUEUE,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(init_scheduler)
    await broadcaster.start()
    await paper_trading.init_pool()
    # Backfills "last known" LTP/prev-day-range from candle_history for any
    # field a restart (or this account's permanently-broken REST backfill)
    # left at 0 — see candle_history.seed_missing_state's own docstring.
    # Re-run daily at 08:45 IST too (scheduler.py's _daily_login), since the
    # REST gap never fixes itself even on a long-running, never-restarted process.
    await candle_history.seed_missing_state(market_state)
    # Fully isolated from the scheduler/broadcaster above — its own asyncio
    # background loop, reads candle_history read-only, writes nothing back
    # into MarketState. See smart_money.py.
    smart_money_task = asyncio.create_task(smart_money.run_loop())
    try:
        yield
    finally:
        smart_money_task.cancel()
        await broadcaster.stop()
        shutdown_scheduler()
        await paper_trading.close_pool()


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


require_login = security.require_login

app.include_router(paper_trading.router)
app.include_router(charts.router)
app.include_router(smart_money.router)


# ----------------- dashboard login (Supabase-verified; session cookie) -----------------
class Credentials(BaseModel):
    access_token: str


@app.post("/api/auth/login")
async def login(creds: Credentials, request: Request):
    user = security.authenticate(creds.access_token)
    if not user:
        raise HTTPException(status_code=401, detail="invalid credentials")
    request.session["user"] = user
    await paper_trading.ensure_wallet(user["user_id"])
    return {"authenticated": True, "user": user["email"]}


@app.post("/api/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"authenticated": False}


@app.get("/api/auth/me")
async def me(request: Request):
    """Public: lets the SPA decide whether to show the login screen."""
    user = request.session.get("user")
    return {
        "authenticated": security.is_authenticated(request),
        "user": user["email"] if user else None,
    }


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
        return HTMLResponse(
            _callback_html(False, "Token exchange failed. Check server logs."), status_code=400
        )
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


# ----------------- AI Copilot routes (login-gated) -----------------
from . import ai_copilot


@app.get("/api/ai/premarket-bias", dependencies=[Depends(require_login)])
async def ai_premarket_bias():
    return ai_copilot.get_premarket_briefing()


@app.post("/api/ai/analyze", dependencies=[Depends(require_login)])
async def ai_analyze_stock(body: dict):
    sym = body.get("symbol", "").strip().upper()
    if not sym:
        return JSONResponse({"error": "Symbol is required"}, status_code=400)
    return ai_copilot.analyze_trade_setup(sym)


@app.get("/api/health")
async def health():
    return {"status": "ok", "market_open": is_market_open(), **auth.auth_status()}


@app.get("/api/snapshot", dependencies=[Depends(require_login)])
async def snapshot():
    """One-shot current state, in the same frame shape as a WS 'snapshot' message.
    Used by the SPA to warm its store when it can't open a WebSocket yet."""
    curr = _live_snapshot()
    return build_frame(prev=None, curr=curr, seq=0)


@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket):
    # Auth: session cookie is exposed on websocket.session by SessionMiddleware.
    await websocket.accept()
    if not security.is_authenticated(websocket):
        await websocket.close(code=4401)
        return
    q = broadcaster.subscribe()
    receiver_task = asyncio.create_task(_ws_reader(websocket, q))
    try:
        while True:
            msg = await q.get()
            await websocket.send_text(msg)
    except (WebSocketDisconnect, RuntimeError):
        # Normal client disconnect or socket teardown by browser
        pass
    except Exception:  # noqa: BLE001
        # Unexpected server-side transport error
        logger.exception("ws send error")
    finally:
        receiver_task.cancel()
        try:
            await receiver_task
        except (asyncio.CancelledError, Exception):
            pass
        broadcaster.unsubscribe(q)


async def _ws_reader(websocket: WebSocket, q):
    """Handle inbound client control messages (only 'resync' for now)."""
    try:
        while True:
            try:
                msg = await websocket.receive_json()
            except (_json.JSONDecodeError, TypeError, ValueError) as exc:
                logger.warning("discarding malformed inbound ws message: %r", exc)
                continue
            if isinstance(msg, dict) and msg.get("type") == "resync":
                broadcaster.mark_resync(q)
    except WebSocketDisconnect:
        return
    except Exception:  # noqa: BLE001
        logger.exception("ws reader exiting on unexpected error")
        return


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
    logger.info("Frontend dist not found at %s; not serving SPA (dev mode / Vite proxy).", _DIST)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, reload=False)
