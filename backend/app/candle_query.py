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

from datetime import date, datetime, timedelta

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
    if (
        candles
        and candles[-1]["bucket_minute"] == bucket_minute
        and candles[-1]["bucket_date"] == today_str
    ):
        return candles
    candles.append(
        {
            "bucket_date": today_str,
            "bucket_minute": bucket_minute,
            "open": o,
            "high": h,
            "low": l,
            "close": c,
            "delta": delta,
            "is_live": True,
        }
    )
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
        if latest and str(latest) != today_str:
            lat_str = str(latest)
            prev_rows = await candle_history.get_candles(symbol, lat_str)
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
        _format_row(
            r,
            (
                r["bucket_date"].isoformat()
                if hasattr(r["bucket_date"], "isoformat")
                else str(r["bucket_date"])
            ),
        )
        for r in rows
    ]
    candles = _append_live(candles, symbol, today)

    # If lookback returned zero rows (e.g. extended market holiday or weekend),
    # fallback to the most recent historical trading session available in the database.
    if not candles:
        latest = await candle_history.get_latest_candle_date(symbol)
        if latest and str(latest) != today_str:
            lat_date = latest if isinstance(latest, date) else datetime.strptime(str(latest), "%Y-%m-%d").date()
            from_date = lat_date - timedelta(days=days * 2)
            rows = await candle_history.get_candles_range(symbol, from_date, lat_date)
            candles = [
                _format_row(
                    r,
                    (
                        r["bucket_date"].isoformat()
                        if hasattr(r["bucket_date"], "isoformat")
                        else str(r["bucket_date"])
                    ),
                )
                for r in rows
            ]

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
    """Opening-range (C1) + previous-day high/low/pivot + CPR — derived from fields
    already computed live by the existing ORB engine / REST backfill."""
    c1 = (stock.get("orb") or {}).get("C1") or {}
    prev_high = stock.get("yesterday_high") or None
    prev_low = stock.get("yesterday_low") or None
    prev_close = stock.get("prev_close") or None
    pivot = (
        (prev_high + prev_low + prev_close) / 3 if prev_high and prev_low and prev_close else None
    )
    bc = ((prev_high + prev_low) / 2) if prev_high and prev_low else None
    tc = ((pivot - bc) + pivot) if pivot and bc else None
    cpr_bottom = min(bc, tc) if bc and tc else None
    cpr_top = max(bc, tc) if bc and tc else None
    cpr_width_pct = (abs(tc - bc) / pivot * 100) if pivot and bc and tc and pivot > 0 else None

    return {
        "opening_range_high": c1.get("high"),
        "opening_range_low": c1.get("low"),
        "prev_day_high": prev_high,
        "prev_day_low": prev_low,
        "pivot": pivot,
        "cpr_bottom": round(cpr_bottom, 2) if cpr_bottom is not None else None,
        "cpr_top": round(cpr_top, 2) if cpr_top is not None else None,
        "cpr_width_pct": round(cpr_width_pct, 3) if cpr_width_pct is not None else None,
    }


def get_cpr_regime(stock: dict) -> dict:
    """
    Computes Central Pivot Range (CPR) metrics and regime classification:
    - Narrow CPR (< 0.30% of price): Strong directional expansion day (boost ORB/Breakout).
    - Wide CPR (> 0.60% of price): Range-bound / choppy day (veto breakout traps).
    """
    prev_high = float(stock.get("yesterday_high") or 0.0)
    prev_low = float(stock.get("yesterday_low") or 0.0)
    prev_close = float(stock.get("prev_close") or 0.0)
    if prev_high <= 0 or prev_low <= 0 or prev_close <= 0:
        return {"has_cpr": False, "is_narrow": False, "is_wide": False, "cpr_width_pct": 0.0}

    pivot = (prev_high + prev_low + prev_close) / 3.0
    bc = (prev_high + prev_low) / 2.0
    tc = (pivot - bc) + pivot
    cpr_width_pct = abs(tc - bc) / pivot * 100.0 if pivot > 0 else 0.0

    return {
        "has_cpr": True,
        "pivot": round(pivot, 2),
        "bc": round(bc, 2),
        "tc": round(tc, 2),
        "cpr_bottom": round(min(bc, tc), 2),
        "cpr_top": round(max(bc, tc), 2),
        "cpr_width_pct": round(cpr_width_pct, 3),
        "is_narrow": cpr_width_pct <= 0.30,
        "is_wide": cpr_width_pct >= 0.60,
    }



async def get_all_mini_candles() -> dict[str, list[dict]]:
    """Fetch today's 5-minute candles for all symbols (completed Postgres + live in-progress)."""
    from datetime import time as dt_time

    from .state import market_state

    now = datetime.now(IST)
    today = now.date()

    all_candles = await candle_history.get_all_today_candles(today)

    # Merge live in-progress bucket if today is trading day
    for sym in market_state.stocks.keys():
        live = candle_aggregator.get_in_progress(sym)
        if live and live[0] == today:
            b_min, (o, h, l, c), _d = live[1], live[2], live[3]
            sym_list = all_candles.setdefault(sym, [])
            if not sym_list or sym_list[-1]["bucket"] != b_min:
                sym_list.append(
                    {
                        "bucket": b_min,
                        "open": o,
                        "high": h,
                        "low": l,
                        "close": c,
                    }
                )
    return all_candles
