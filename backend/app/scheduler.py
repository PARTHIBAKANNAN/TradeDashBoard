"""
Time-aware orchestration:

  * 08:45 IST daily  -> refresh the access token programmatically (TOTP).
  * 09:15 IST daily  -> backfill + start the websocket feed.
  * 15:30 IST daily  -> stop the websocket to conserve bandwidth (standby).
  * 15:35 IST daily  -> delete candle_history rows older than 30 calendar
                        days (~21 trading days) — rolling retention cap.

Uses APScheduler on the IST timezone. On startup, if the process boots
mid-session, the engine is brought straight to the correct state.
"""

import asyncio
import logging
import threading
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from . import (auth, candle_aggregator, candle_history, config, momentum_score,
               order_monitor, paper_trading, telegram_notify)
from .config import IST, MARKET_CLOSE, MARKET_OPEN
from .fyers_service import data_engine
from .state import market_state

logger = logging.getLogger(__name__)

# Symbols recommended as of the last checkpoint — lets the digest only fire
# when the top-3 actually changes, instead of repeat-spamming unchanged picks
# every 30 minutes.
_last_recommended: set[str] = set()


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
        logger.info(
            "DATA_ENGINE_ENABLED=false on '%s'; not opening the FYERS websocket "
            "(single-WS-per-app safety).",
            config.INSTANCE_NAME,
        )
        return
    if not data_engine.access_token:
        token = auth.get_access_token()
        if token:
            data_engine.set_token(token)
    if not data_engine.access_token:
        logger.warning(
            "No valid FYERS token — engine idle until you connect (dashboard -> 'Connect FYERS')."
        )
        return

    data_engine.backfill()
    market_state.market_open = True
    _launch_ws_thread()
    _last_recommended.clear()  # fresh day, don't let yesterday's picks suppress today's digest
    logger.info("Data engine started on '%s' (single-WS owner).", config.INSTANCE_NAME)


def ensure_engine_running():
    """Start the engine now if it should be running but isn't (e.g. right after a
    mid-session /callback login). Safe to call repeatedly."""
    if not config.DATA_ENGINE_ENABLED or not is_market_open():
        return
    if data_engine.access_token and not data_engine.running:
        _start_engine()


def _refresh_opening_range():
    """
    09:46 IST: the 9:15-9:45 opening range has now fully printed. If the engine
    booted right at market-open, _backfill_today_orb()/_backfill_orb_quality()
    ran against a still-forming candle and found nothing — re-run them now that
    real data exists, so the C1 breakout signal and its quality gate are live
    for the rest of the day.
    """
    if not config.DATA_ENGINE_ENABLED or not data_engine.rest:
        return
    data_engine._backfill_today_orb()
    data_engine._backfill_orb_quality()
    logger.info("Opening-range (9:15-9:45) data refreshed.")


def _recommended_digest():
    """Runs on this cron job's own worker thread, not the asyncio loop — so
    unlike close_order()'s Telegram alert, this can call
    telegram_notify.send_message directly with no run_in_executor hop.
    market_state.lock() is a plain threading.RLock, safe to take here too."""
    if not config.TELEGRAM_BOT_TOKEN or not config.TELEGRAM_CHAT_ID:
        return
    global _last_recommended
    with market_state.lock():
        stocks = [dict(s) for s in market_state.stocks.values()]
        nifty_pct_change = market_state.nifty.get("pct_change", 0.0)
    picks = momentum_score.compute_recommended(stocks, nifty_pct_change)
    symbols = {sym for sym, _score in picks}
    if symbols == _last_recommended:
        return  # unchanged since the last checkpoint — don't repeat-spam
    _last_recommended = symbols
    if not picks:
        return  # nothing clears the confidence floor right now; no message
    now_str = datetime.now(IST).strftime("%H:%M")
    lines = [f"⭐ *Recommended* ({now_str} IST):"]
    for sym, score in picks:
        lines.append(f"  {sym} — score {score:.0f}")
    telegram_notify.send_message("\n".join(lines))


def _stop_engine():
    data_engine.stop_websocket()
    market_state.market_open = False
    logger.info("Data engine stopped (market closed / standby).")


def _market_close():
    """15:30 IST cron job only — stops the engine AND squares off every open
    paper position (matches real intraday/MIS broker rules). Kept separate
    from `_stop_engine` (also called by `shutdown_scheduler` on app shutdown)
    because square-off blocks this worker thread waiting on the asyncio loop;
    calling it from the loop's own thread at shutdown would deadlock."""
    _stop_engine()
    paper_trading.square_off_all_sync()
    candle_aggregator.flush_all()


def _cleanup_old_candles():
    """15:35 IST cron job — deletes candle_history rows older than 30 calendar
    days (~21 trading days), enforcing the rolling retention cap. Runs 5 min
    after market close so flush_all() has already persisted the day's last
    bucket before we touch the table."""
    from . import candle_history, order_monitor

    loop = order_monitor.get_loop()
    if loop is None:
        logger.info("retention: DB pool not available; skipping candle cleanup.")
        return
    today = datetime.now(IST).date()
    cutoff = today - timedelta(days=30)  # 30 calendar days ≈ 21 trading days
    asyncio.run_coroutine_threadsafe(candle_history.delete_candles_older_than(cutoff), loop)


def _daily_login():
    from . import candle_history, order_monitor

    token = auth.get_access_token(force_refresh=True)
    if not token:
        logger.warning("Daily token refresh failed — MANUAL LOGIN required.")
        return
    data_engine.set_token(token)
    logger.info("Daily token refreshed.")
    # Reset signals across all stocks at 08:45 AM auth token refresh for the new daily session
    market_state.reset_signals()
    logger.info("Market state signals reset for the new session.")
    # Refresh yesterday's high/low/close (and, pre-market, a "last known" LTP)
    # from candle_history — this account's REST backfill can't do it (-403),
    # and this cron runs on its own thread, so hop onto the asyncio loop the
    # same way candle_aggregator._persist_bucket does.
    loop = order_monitor.get_loop()
    if loop is not None:
        asyncio.run_coroutine_threadsafe(candle_history.seed_missing_state(market_state), loop)
    # If the socket is live, rebuild it so the new token takes effect (the token
    # is baked into the connection string at connect time).
    if config.DATA_ENGINE_ENABLED and data_engine.running:
        logger.info("Rebuilding websocket with the refreshed token ...")
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
    # 09:46 opening range (9:15-9:45) complete -> refresh C1 ORB + breakout-quality gate
    scheduler.add_job(
        _refresh_opening_range,
        CronTrigger(day_of_week="mon-fri", hour=9, minute=46, timezone=IST),
        id="opening_range_refresh",
        replace_existing=True,
    )
    # 15:30 market close -> standby + square off all open paper positions
    scheduler.add_job(
        _market_close,
        CronTrigger(day_of_week="mon-fri", hour=15, minute=30, timezone=IST),
        id="market_close",
        replace_existing=True,
    )
    # Recommended-tag digest checkpoints: 09:45, then every 30 min through
    # 15:15 (last one before market close) — three cron rules cover the
    # slightly irregular first checkpoint plus the regular 30-min cadence.
    scheduler.add_job(
        _recommended_digest,
        CronTrigger(day_of_week="mon-fri", hour=9, minute=45, timezone=IST),
        id="recommended_digest_0945",
        replace_existing=True,
    )
    scheduler.add_job(
        _recommended_digest,
        CronTrigger(day_of_week="mon-fri", hour="10-14", minute="15,45", timezone=IST),
        id="recommended_digest_checkpoints",
        replace_existing=True,
    )
    scheduler.add_job(
        _recommended_digest,
        CronTrigger(day_of_week="mon-fri", hour=15, minute=15, timezone=IST),
        id="recommended_digest_1515",
        replace_existing=True,
    )
    # 15:35 candle history retention cleanup (~21 trading days rolling window)
    scheduler.add_job(
        _cleanup_old_candles,
        CronTrigger(day_of_week="mon-fri", hour=15, minute=35, timezone=IST),
        id="candle_retention_cleanup",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Instance '%s', data_engine=%s.",
        config.INSTANCE_NAME,
        "ON" if config.DATA_ENGINE_ENABLED else "OFF",
    )

    if not config.DATA_ENGINE_ENABLED:
        logger.info("Data engine disabled on this instance; serving cached/empty snapshot only.")
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
        logger.info("Booted in standby (market closed); serving snapshot.")


def shutdown_scheduler():
    _stop_engine()
    if scheduler.running:
        scheduler.shutdown(wait=False)
