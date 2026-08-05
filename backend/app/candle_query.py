"""
Serves "today's 5-min candles + reference levels" for the Charts tab by
merging two otherwise-disconnected sources: candle_history (Postgres, every
*completed* bucket) and candle_aggregator's in-memory in-progress bucket (not
yet persisted). Kept as its own module rather than folded into either of
those two — importing one from the other at module level would create a
circular import, and this way both already-verified modules (ORB signal
engine; backtest-persistence groundwork) stay untouched except for the two
tiny read-only accessors they each expose.
"""

from datetime import datetime

from . import candle_aggregator, candle_history
from .config import IST


async def get_today_candles(symbol: str) -> dict:
    today = datetime.now(IST).date()
    rows = await candle_history.get_candles(symbol, today)
    candles = [
        {
            "bucket_minute": r["bucket_minute"],
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "is_live": False,
        }
        for r in rows
    ]

    live = candle_aggregator.get_in_progress(symbol)
    if live and live[0] == today:
        bucket_minute, (o, h, l, c) = live[1], live[2]
        if not candles or candles[-1]["bucket_minute"] != bucket_minute:
            candles.append(
                {
                    "bucket_minute": bucket_minute,
                    "open": o,
                    "high": h,
                    "low": l,
                    "close": c,
                    "is_live": True,
                }
            )

    return {"symbol": symbol, "date": today.isoformat(), "candles": candles}


def get_levels(stock: dict) -> dict:
    """Opening-range (C1) + previous-day high/low — both already computed
    live by the existing ORB engine / REST backfill, nothing new to derive."""
    c1 = (stock.get("orb") or {}).get("C1") or {}
    return {
        "opening_range_high": c1.get("high"),
        "opening_range_low": c1.get("low"),
        "prev_day_high": stock.get("yesterday_high") or None,
        "prev_day_low": stock.get("yesterday_low") or None,
    }
