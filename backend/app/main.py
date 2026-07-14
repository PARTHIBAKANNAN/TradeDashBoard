"""
FastAPI Backend-For-Frontend.

Ingests millisecond ticks in-memory (via DataEngine), then a single Broadcaster
task fans a diffed JSON frame out to all WebSocket subscribers every
`STREAM_INTERVAL` seconds. No broker credentials or raw broker sockets are
ever exposed to the client. A built-in login (session cookie) gates the
dashboard; FYERS account auth is handled separately via /callback + /api/auth/*.
"""
import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from . import auth, config, security
from .broadcaster import Broadcaster, build_frame, snapshot_from_state
from .fyers_service import data_engine
from .scheduler import ensure_engine_running, init_scheduler, is_market_open, shutdown_scheduler
from .state import market_state


def _live_snapshot() -> dict:
    """Snapshot provider for the Broadcaster: reads state + patches fyers flag."""
    snap = snapshot_from_state(market_state)
    snap["fyers_connected"] = auth.auth_status()["authenticated"]
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
    try:
        yield
    finally:
        await broadcaster.stop()
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


# ----------------- dashboard login (built-in; future: subscriptions) -----------------
class Credentials(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
async def login(creds: Credentials, request: Request):
    if not security.authenticate(creds.username, creds.password):
        raise HTTPException(status_code=401, detail="invalid credentials")
    request.session["user"] = creds.username
    return {"authenticated": True, "user": creds.username}


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
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        # Any send error → connection dead; fall through to cleanup.
        pass
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
            msg = await websocket.receive_json()
            if isinstance(msg, dict) and msg.get("type") == "resync":
                broadcaster.mark_resync(q)
    except (WebSocketDisconnect, Exception):
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
    print(f"[main] Frontend dist not found at {_DIST}; not serving SPA (dev mode / Vite proxy).")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, reload=False)
