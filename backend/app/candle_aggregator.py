"""
Live-tick-derived opening-range data — replaces FYERS' REST Historical Data
API for this purpose, which is unreliable on this account (confirmed via
production logs: every history() call returns `-403 Additional permission
required. Please edit the app and regenerate access token`). That REST call
is what fyers_service.py's `_backfill_today_orb()`/`_backfill_orb_quality()`
use to populate `stock["orb"]`, `candle1_high/low`, and `two_sided_ok` — with
it broken, those fields never populate and no "Bull/Bear • C1-C4" signal can
ever fire (calculations.evaluate_orb() requires non-empty `orb` bounds).

This module derives the same fields directly from live ticks, which already
flow reliably through calculations.process_incoming_tick on every price
update — no REST dependency at all. Mirrors the client-side candle
aggregation already used for the mini-candlestick chart
(frontend/src/hooks/useMarketStream.js's processCandles), just server-side
and scoped to what the ORB signal engine needs (window high/low, not full
OHLC, except for the six 5-min opening-range candles where open/close matter
for the two-sided-range check).

Known limitation: this is purely tick-driven with no persistence, so a
backend restart between market open and 09:45 loses that day's opening-range
quality gate (`two_sided_ok`/`candle1_high/low` stay at their fail-closed
defaults for the rest of the day) — and a restart after an ORB candle's
window has closed loses that candle's boundaries permanently for the day.
The REST backfill in fyers_service.py is left in place as a best-effort
first attempt (harmless if it keeps failing; if FYERS' permission is ever
restored, it'll seed these fields too — this module's tick updates simply
layer on top without conflict either way).
"""

import asyncio
from datetime import datetime

from .config import ORB_CANDLES

_OPENING_RANGE_END = ORB_CANDLES[0][2]  # 09:45 — end of the 6-candle opening range
_FIVE_MIN = 5

# symbol -> {bucket_start_minute: [open, high, low, close]}. Discarded once
# the opening range completes for that symbol — nothing here is needed again
# after `two_sided_ok`/`candle1_high/low` are set.
_opening_5min: dict[str, dict[int, list]] = {}

# symbol -> (bucket_date, bucket_minute, [open, high, low, close]) — tracks
# the WHOLE session (09:15-15:30), kept deliberately SEPARATE from
# `_opening_5min` above so this addition (backtest groundwork only, see
# candle_history.py) can never regress the already-verified ORB/quality-gate
# logic. Persisted to Postgres each time a bucket completes.
_day_candles: dict[str, tuple] = {}


def _five_min_bucket(now: datetime) -> int:
    return (now.hour * 60 + now.minute) // _FIVE_MIN * _FIVE_MIN


def on_tick(stock: dict, ltp: float, now: datetime) -> None:
    """Called from calculations.process_incoming_tick for every tick, while
    the caller already holds MarketState's lock. Updates `stock["orb"]`
    live, and once the opening range (09:15-09:45) completes, seeds
    `candle1_high/low` and `two_sided_ok`."""
    now_t = now.time()
    for name, start, end in ORB_CANDLES:
        if start <= now_t < end:
            bounds = stock["orb"].setdefault(name, {"high": ltp, "low": ltp})
            bounds["high"] = max(bounds["high"], ltp)
            bounds["low"] = min(bounds["low"], ltp)
            break

    sym = stock["symbol"]
    _track_day_candle(sym, ltp, now)
    if now_t < _OPENING_RANGE_END:
        _update_opening_5min(sym, ltp, now)
    elif sym in _opening_5min:
        _finalize_opening_range(stock)


def _update_opening_5min(sym: str, ltp: float, now: datetime) -> None:
    bucket = _five_min_bucket(now)
    candles = _opening_5min.setdefault(sym, {})
    ohlc = candles.get(bucket)
    if ohlc is None:
        candles[bucket] = [ltp, ltp, ltp, ltp]  # open, high, low, close
    else:
        ohlc[1] = max(ohlc[1], ltp)
        ohlc[2] = min(ohlc[2], ltp)
        ohlc[3] = ltp


def _finalize_opening_range(stock: dict) -> None:
    from .calculations import has_two_sided_range

    candles = _opening_5min.pop(stock["symbol"], {})
    ordered = [candles[b] for b in sorted(candles)]
    if ordered:
        stock["candle1_high"] = ordered[0][1]
        stock["candle1_low"] = ordered[0][2]
    # has_two_sided_range expects [ts, open, high, low, close, volume] rows —
    # ts/volume aren't used by that check, pad with 0.
    rows = [[0, o, h, l, c, 0] for o, h, l, c in ordered]
    stock["two_sided_ok"] = has_two_sided_range(rows)


def _track_day_candle(sym: str, ltp: float, now: datetime) -> None:
    """Backtest groundwork only — persists each completed 5-min candle across
    the whole session, independent of the opening-range-specific logic above."""
    bucket = _five_min_bucket(now)
    today = now.date()
    prev = _day_candles.get(sym)
    if prev is None or prev[0] != today or prev[1] != bucket:
        if prev is not None:
            _persist_bucket(sym, *prev)
        _day_candles[sym] = (today, bucket, [ltp, ltp, ltp, ltp])
    else:
        ohlc = prev[2]
        ohlc[1] = max(ohlc[1], ltp)
        ohlc[2] = min(ohlc[2], ltp)
        ohlc[3] = ltp


def _persist_bucket(sym: str, bucket_date, bucket_minute: int, ohlc: list) -> None:
    from . import order_monitor
    from .candle_history import persist_candle

    loop = order_monitor.get_loop()
    if loop is None:
        return  # paper trading (and its DB pool) not configured
    asyncio.run_coroutine_threadsafe(
        persist_candle(sym, bucket_date, bucket_minute, list(ohlc)), loop
    )


def flush_all() -> None:
    """Persists every still-open bucket — called once at 15:30 IST market
    close (scheduler.py) so the last partial candle of the day isn't lost."""
    for sym, (bucket_date, bucket_minute, ohlc) in list(_day_candles.items()):
        _persist_bucket(sym, bucket_date, bucket_minute, ohlc)
    _day_candles.clear()
