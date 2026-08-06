"""
Smart Money Engine — a pre-breakout, cross-sectional ranking across the F&O
universe, recomputed every 5 minutes straight from candle_history's own
accumulating 5-min OHLCV archive (see candle_aggregator.py / candle_history.py).

Fully isolated from the existing Ranking/Charts/Watchlist/Heatmap/Insights
stack: this module only READS market_state and candle_history, never writes
back into MarketState or the broadcast snapshot, and is surfaced through its
own router (smart_money.router) + its own frontend tab. Nothing here can
regress any other screen.

Per Smart_Money_Engine_Implementation_Guide.pdf:
  Fresh Turnover       = candle volume x candle close (the spec's own
                          fallback — a true per-bucket VWAP isn't tracked;
                          Close is "preferred, or Close" per the spec).
  Fresh Turnover Ratio = today's Fresh Turnover / that symbol's average
                         Fresh Turnover in the SAME 5-min slot over its last
                         LOOKBACK_DAYS trading days.
  RVOL                 = today's bucket volume / average volume for that
                         same slot.
  Relative Strength    = stock's today-so-far return - NIFTY's today-so-far
                         return, both = (latest close - today's open) /
                         today's open. Deliberately different from the
                         existing Ranking tab's `relative_strength` field
                         (which is anchored on yesterday's close, not today's
                         open) — this mirrors the spec exactly, kept local to
                         this module rather than reusing/changing that field.
  Smart Money Score     = 0.50 x FreshTurnoverRatio percentile
                         + 0.30 x RVOL percentile
                         + 0.20 x RelativeStrength percentile

A symbol needs at least MIN_HISTORY_DAYS of same-slot history before its
ratio-based metrics mean anything. candle_history only started accumulating
on 2026-08-06 (when the Charts tab shipped), so for the first few trading
days most/all symbols are excluded — the API response says exactly how many
symbols are eligible and how many trading days of history exist, and the
frontend shows a "building history" banner instead of pretending the ranking
is reliable before then.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends

from . import candle_aggregator, candle_history, security
from .config import IST
from .state import market_state

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/smart-money", tags=["smart-money"], dependencies=[Depends(security.require_login)]
)

BENCHMARK_SHORT_SYMBOL = "NIFTY50"
LOOKBACK_DAYS = 20
MIN_HISTORY_DAYS = 3  # below this, ratio metrics are too noisy to rank on
TOP_N = 10
WEIGHTS = {"turnover": 0.50, "rvol": 0.30, "rs": 0.20}
RECOMPUTE_INTERVAL_SECONDS = 300  # 5 minutes, per the spec's own cadence

# Written only by compute_rankings(), read only by get_latest() — the FastAPI
# route handler runs on the same asyncio loop as the background loop below,
# so there's no cross-thread race to guard against (unlike MarketState, which
# is shared with the WebSocket callback thread).
_latest: dict = {
    "computed_at": None,
    "market_open": False,
    "total_symbols": 0,
    "eligible_symbols": 0,
    "min_history_days": MIN_HISTORY_DAYS,
    "lookback_days": LOOKBACK_DAYS,
    "top": [],
}


def _percentile_rank(value: float, values: list[float]) -> float:
    if not values:
        return 0.0
    below = sum(1 for v in values if v <= value)
    return below / len(values) * 100


def _latest_row(rows: list[dict]) -> dict | None:
    return rows[-1] if rows else None


def _merge_in_progress(symbol: str, rows: list[dict], today) -> list[dict]:
    """Appends the currently-forming (not yet persisted) bucket, if any, so
    the ranking uses the freshest data available rather than lagging by up
    to one 5-min bucket."""
    live = candle_aggregator.get_in_progress(symbol)
    if not live or live[0] != today:
        return rows
    bucket_minute, (o, h, l, c), _delta, volume = live[1], live[2], live[3], live[4]
    if rows and rows[-1]["bucket_minute"] == bucket_minute:
        return rows
    return rows + [
        {"bucket_minute": bucket_minute, "open": o, "high": h, "low": l, "close": c, "volume": volume}
    ]


def _today_return(rows: list[dict]) -> float | None:
    first, last = rows[0], rows[-1]
    open_ = float(first["open"] or 0)
    if not open_:
        return None
    return (float(last["close"]) - open_) / open_ * 100


async def compute_rankings() -> dict:
    """Recomputes the Top-N Smart Money ranking and stores it for get_latest()
    to serve. Safe to call repeatedly (e.g. every 5 min from run_loop(), or
    once eagerly at startup) — a transient DB hiccup just leaves the previous
    snapshot in place rather than raising into the caller's loop."""
    global _latest
    try:
        today = datetime.now(IST).date()
        by_symbol = await candle_history.get_today_all_symbols(today)
        history_before = today - timedelta(days=1)
        slot_stats = await candle_history.get_historical_slot_stats(history_before, LOOKBACK_DAYS)

        with market_state.lock():
            universe = {sym: dict(s) for sym, s in market_state.stocks.items()}

        nifty_rows = _merge_in_progress(BENCHMARK_SHORT_SYMBOL, by_symbol.get(BENCHMARK_SHORT_SYMBOL, []), today)
        nifty_return = _today_return(nifty_rows) if nifty_rows else None

        candidates = []
        for sym, stock in universe.items():
            rows = _merge_in_progress(sym, by_symbol.get(sym, []), today)
            if not rows or nifty_return is None:
                continue
            last = _latest_row(rows)
            slot = slot_stats.get((sym, last["bucket_minute"]))
            days = slot["days"] if slot else 0
            stock_return = _today_return(rows)
            if stock_return is None:
                continue

            fresh_turnover = float(last["close"]) * float(last["volume"] or 0)
            volume = float(last["volume"] or 0)
            fresh_turnover_ratio = None
            rvol = None
            if slot and days >= MIN_HISTORY_DAYS:
                if slot["avg_turnover"]:
                    fresh_turnover_ratio = fresh_turnover / slot["avg_turnover"]
                if slot["avg_volume"]:
                    rvol = volume / slot["avg_volume"]

            candidates.append(
                {
                    "symbol": sym,
                    "sector": stock.get("sector"),
                    "days_history": days,
                    "fresh_turnover_ratio": fresh_turnover_ratio,
                    "rvol": rvol,
                    "relative_strength": round(stock_return - nifty_return, 2),
                }
            )

        eligible = [
            c for c in candidates if c["fresh_turnover_ratio"] is not None and c["rvol"] is not None
        ]
        turnover_vals = [c["fresh_turnover_ratio"] for c in eligible]
        rvol_vals = [c["rvol"] for c in eligible]
        rs_vals = [c["relative_strength"] for c in eligible]

        for c in eligible:
            turnover_pct = _percentile_rank(c["fresh_turnover_ratio"], turnover_vals)
            rvol_pct = _percentile_rank(c["rvol"], rvol_vals)
            rs_pct = _percentile_rank(c["relative_strength"], rs_vals)
            c["fresh_turnover_percentile"] = round(turnover_pct, 1)
            c["rvol_percentile"] = round(rvol_pct, 1)
            c["relative_strength_percentile"] = round(rs_pct, 1)
            c["score"] = round(
                WEIGHTS["turnover"] * turnover_pct
                + WEIGHTS["rvol"] * rvol_pct
                + WEIGHTS["rs"] * rs_pct,
                1,
            )

        eligible.sort(key=lambda c: c["score"], reverse=True)

        _latest = {
            "computed_at": datetime.now(IST).isoformat(),
            "market_open": market_state.market_open,
            "total_symbols": len(universe),
            "eligible_symbols": len(eligible),
            "min_history_days": MIN_HISTORY_DAYS,
            "lookback_days": LOOKBACK_DAYS,
            "top": eligible[:TOP_N],
        }
    except Exception:  # noqa: BLE001 — a bad cycle must never take the loop down
        logger.exception("smart_money: compute_rankings failed")
    return _latest


def get_latest() -> dict:
    return _latest


async def run_loop() -> None:
    """Started once from main.py's lifespan, cancelled on shutdown. Computes
    immediately on startup (so the tab isn't empty for a full 5 minutes after
    a restart), then on the spec's own 5-minute cadence."""
    while True:
        try:
            await compute_rankings()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("smart_money: run_loop iteration failed")
        await asyncio.sleep(RECOMPUTE_INTERVAL_SECONDS)


@router.get("/top10")
async def get_top10():
    return get_latest()
