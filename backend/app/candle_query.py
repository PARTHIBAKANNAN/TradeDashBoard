"""
Serves 5-min candles + reference levels for the Charts tab.

Three fetch modes:
  get_today_candles(symbol)          — today's candles + prev-day fallback
                                        (used by the grid card on first load)
  get_date_candles(symbol, date)     — any specific historical date
                                        (used by ◀ Prev Day / Today ▶ nav)
  get_multi_day_candles(symbol, n)   — last n trading-days continuously
                                        (used by the full-screen modal)

Each function merges completed Postgres rows with candle_aggregator's live
in-progress bucket for today's data. Past-day fetches are immutable (no live
bucket appended). All three share get_levels() for overlay lines.
"""

from datetime import datetime, date, timedelta

from . import candle_aggregator, candle_history
from .config import IST


def _format_row(r: dict, bucket_date_str: str, is_live: bool = False) -> dict:
    return {
        "bucket_date": bucket_date_str,
        "bucket_minute": r["bucket_minute"],
        "open": float(r["open"]),
        "high": float(r["high"]),
        "low": float(r["low"]),
        "close": float(r["close"]),
        "delta": float(r["delta"]) if r.get("delta") is not None else 0.0,
        "is_live": is_live,
    }


def _append_live(candles: list, symbol: str, today: date) -> list:
    """Append the in-progress (not yet persisted) bucket for today if present."""
    live = candle_aggregator.get_in_progress(symbol)
    if not live or live[0] != today:
        return candles
    bucket_minute, (o, h, l, c), delta = live[1], live[2], live[3]
    today_str = today.isoformat()
    # Don't duplicate if the last persisted row already covers this bucket.
    if candles and candles[-1]["bucket_minute"] == bucket_minute and candles[-1]["bucket_date"] == today_str:
        return candles
    candles.append({
        "bucket_date": today_str,
        "bucket_minute": bucket_minute,
        "open": o,
        "high": h,
        "low": l,
        "close": c,
        "delta": delta,
        "is_live": True,
    })
    return candles


async def get_today_candles(symbol: str) -> dict:
    """Today's candles for the grid chart card. Falls back to the most recent
    available date when today has no data (pre-market, weekend, Monday)."""
    today = datetime.now(IST).date()
    today_str = today.isoformat()
    rows = await candle_history.get_candles(symbol, today)
    candles = [_format_row(r, today_str) for r in rows]
    candles = _append_live(candles, symbol, today)

    # ── Prev-day fallback ─────────────────────────────────────────────────────
    is_previous_day = False
    candle_date = today_str
    if not candles:
        latest = await candle_history.get_latest_candle_date(symbol)
        if latest and latest != today:
            prev_rows = await candle_history.get_candles(symbol, latest)
            lat_str = latest.isoformat()
            candles = [_format_row(r, lat_str) for r in prev_rows]
            is_previous_day = True
            candle_date = lat_str

    return {
        "symbol": symbol,
        "date": today_str,
        "candle_date": candle_date,
        "is_previous_day": is_previous_day,
        "candles": candles,
    }


async def get_date_candles(symbol: str, target_date: date) -> dict:
    """Completed candles for a specific historical date (◀/▶ navigation).
    Never appends the live bucket — past days are immutable."""
    date_str = target_date.isoformat()
    rows = await candle_history.get_candles(symbol, target_date)
    candles = [_format_row(r, date_str) for r in rows]

    today = datetime.now(IST).date()
    # If the user navigated to "today", also include the live bucket.
    if target_date == today:
        candles = _append_live(candles, symbol, today)

    return {
        "symbol": symbol,
        "date": date_str,
        "candle_date": date_str,
        "is_previous_day": target_date != today,
        "candles": candles,
    }


async def get_multi_day_candles(symbol: str, days: int = 21) -> dict:
    """All completed candles for the last `days` trading days, continuous
    time series for the full-screen modal. Uses get_candles_range() for
    efficiency (one query instead of N). Appends the live bucket for today."""
    today = datetime.now(IST).date()
    today_str = today.isoformat()
    # Over-fetch calendar days to reliably cover the requested trading days.
    from_date = today - timedelta(days=days * 2)
    rows = await candle_history.get_candles_range(symbol, from_date, today)
    candles = [
        _format_row(r, r["bucket_date"].isoformat() if hasattr(r["bucket_date"], "isoformat") else str(r["bucket_date"]))
        for r in rows
    ]
    candles = _append_live(candles, symbol, today)

    is_previous_day = bool(candles) and candles[-1]["bucket_date"] != today_str
    candle_date = candles[-1]["bucket_date"] if candles else today_str

    return {
        "symbol": symbol,
        "date": today_str,
        "candle_date": candle_date,
        "is_previous_day": is_previous_day,
        "candles": candles,
    }


def get_levels(stock: dict) -> dict:
    """Opening-range (C1) + previous-day high/low/pivot — derived from fields
    already computed live by the existing ORB engine / REST backfill."""
    c1 = (stock.get("orb") or {}).get("C1") or {}
    prev_high = stock.get("yesterday_high") or None
    prev_low = stock.get("yesterday_low") or None
    prev_close = stock.get("prev_close") or None
    pivot = (
        (prev_high + prev_low + prev_close) / 3
        if prev_high and prev_low and prev_close
        else None
    )
    return {
        "opening_range_high": c1.get("high"),
        "opening_range_low": c1.get("low"),
        "prev_day_high": prev_high,
        "prev_day_low": prev_low,
        "pivot": pivot,
    }
