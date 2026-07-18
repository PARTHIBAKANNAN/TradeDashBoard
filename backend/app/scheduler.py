"""
Time-aware orchestration:

  * 08:45 IST daily  -> refresh the access token programmatically (TOTP).
  * 09:15 IST daily  -> backfill + start the websocket feed.
  * 15:30 IST daily  -> stop the websocket to conserve bandwidth (standby).

Uses APScheduler on the IST timezone. On startup, if the process boots
mid-session, the engine is brought straight to the correct state.
"""

import threading
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from . import auth, config
from .config import IST, MARKET_CLOSE, MARKET_OPEN
from .fyers_service import data_engine
from .state import market_state


def is_market_open(now: datetime | None = None) -> bool:
    if config.FORCE_MARKET_OPEN:
        return True
    now = now or datetime.now(IST)
    if now.weekday() >= 5:  # Sat/Sun
        return False
    return MARKET_OPEN <= now.time() <= MARKET_CLOSE


def _launch_ws_thread():
    threading.Thread(target=data_engine.start_websocket, daemon=True, name="fyers-ws").start()


def _start_engine():
    """Authenticate (if needed), backfill, and launch the websocket thread."""
    if not config.DATA_ENGINE_ENABLED:
        print(
            f"[scheduler] DATA_ENGINE_ENABLED=false on '{config.INSTANCE_NAME}'; "
            "not opening the FYERS websocket (single-WS-per-app safety)."
        )
        return
    if not data_engine.access_token:
        token = auth.get_access_token()
        if token:
            data_engine.set_token(token)
    if not data_engine.access_token:
        print(
            "[scheduler] No valid FYERS token — engine idle until you connect "
            "(dashboard → 'Connect FYERS')."
        )
        return

    data_engine.backfill()
    market_state.market_open = True
    _launch_ws_thread()
    print(f"[scheduler] Data engine started on '{config.INSTANCE_NAME}' (single-WS owner).")


def ensure_engine_running():
    """Start the engine now if it should be running but isn't (e.g. right after a
    mid-session /callback login). Safe to call repeatedly."""
    if not config.DATA_ENGINE_ENABLED or not is_market_open():
        return
    if data_engine.access_token and not data_engine.running:
        _start_engine()


def _stop_engine():
    data_engine.stop_websocket()
    market_state.market_open = False
    print("[scheduler] Data engine stopped (market closed / standby).")


def _daily_login():
    token = auth.get_access_token(force_refresh=True)
    if not token:
        print("[scheduler] Daily token refresh failed — MANUAL LOGIN required.")
        return
    data_engine.set_token(token)
    print("[scheduler] Daily token refreshed.")
    # If the socket is live, rebuild it so the new token takes effect (the token
    # is baked into the connection string at connect time).
    if config.DATA_ENGINE_ENABLED and data_engine.running:
        print("[scheduler] Rebuilding websocket with the refreshed token ...")
        data_engine.stop_websocket()
        _launch_ws_thread()


scheduler = BackgroundScheduler(timezone=IST)


def init_scheduler():
    # 08:45 fresh token, Mon-Fri
    scheduler.add_job(
        _daily_login,
        CronTrigger(day_of_week="mon-fri", hour=8, minute=45, timezone=IST),
        id="daily_login",
        replace_existing=True,
    )
    # 09:15 market open -> start engine
    scheduler.add_job(
        _start_engine,
        CronTrigger(day_of_week="mon-fri", hour=9, minute=15, timezone=IST),
        id="market_open",
        replace_existing=True,
    )
    # 15:30 market close -> standby
    scheduler.add_job(
        _stop_engine,
        CronTrigger(day_of_week="mon-fri", hour=15, minute=30, timezone=IST),
        id="market_close",
        replace_existing=True,
    )
    scheduler.start()
    print(
        f"[scheduler] Instance '{config.INSTANCE_NAME}', "
        f"data_engine={'ON' if config.DATA_ENGINE_ENABLED else 'OFF'}."
    )

    if not config.DATA_ENGINE_ENABLED:
        print(
            "[scheduler] Data engine disabled on this instance; serving cached/empty snapshot only."
        )
        return

    # Boot straight into the right state depending on when we started.
    if is_market_open():
        _start_engine()
    else:
        # Populate a static snapshot (prev close / last ranges) for the "Closed" view.
        token = auth.get_access_token()
        if token:
            data_engine.set_token(token)
            data_engine.backfill()
        market_state.market_open = False
        print("[scheduler] Booted in standby (market closed); serving snapshot.")


def shutdown_scheduler():
    _stop_engine()
    if scheduler.running:
        scheduler.shutdown(wait=False)
