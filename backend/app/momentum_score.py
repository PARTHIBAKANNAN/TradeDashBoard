"""
Server-side port of frontend/src/utils/momentumScore.js — kept in sync
manually (same intentional-duplication precedent as paper_pnl.py being
mirrored by PositionRow.jsx's own unrealizedPnl helper). Needed because the
Recommended-tag Telegram digest (scheduler.py) must fire independent of
whether the dashboard is open; the frontend-only score can't do that.
"""

import re

from .config import INDUSTRY_GROUP

WEIGHTS = {
    "rs": 0.30,
    "sector": 0.15,
    "volume": 0.20,
    "vwap": 0.15,
    "freshness": 0.10,
    "extension": 0.10,
}
FRESHNESS_BY_CANDLE = {"C1": 100, "C2": 75, "C3": 50, "C4": 25}
CONFIDENCE_FLOOR = 60
MAX_PICKS = 3

# Maps INDUSTRY_GROUP's fine-grained sectors (not WATCHLIST's display sector,
# see config.py) to NIFTY-style clusters for the RS-vs-sector score component.
# Keep in sync with frontend/src/utils/momentumScore.js's INDUSTRY_TO_NIFTY_GROUP.
SECTOR_TO_NIFTY_GROUP = {
    "Energy": "NIFTY ENERGY",
    "Power": "NIFTY ENERGY",
    "Capital Goods": "NIFTY CAPITAL GOODS",
    "Consumer Durables": "NIFTY CONSR DURABLE",
    "Infra": "NIFTY INFRA",
    "Auto": "NIFTY AUTO",
    "Pvt Banks": "NIFTY BANK",
    "PSU Banks": "NIFTY PSU BANK",
    "NBFC": "NIFTY FINSERV",
    "Insurance": "NIFTY FINSERV",
    "Capital Markets": "NIFTY FINSERV",
    "Healthcare": "NIFTY HEALTHCARE",
    "Realty": "NIFTY REALTY",
    "IT": "NIFTY IT",
    "Pharma": "NIFTY PHARMA",
    "Chemicals": "NIFTY CHEMICALS",
    "Consumer": "NIFTY CONSUMPTION",
    "FMCG": "NIFTY FMCG",
    "Cement": "NIFTY CEMENT",
    "Metals": "NIFTY METAL",
}


def nifty_group(sector: str | None) -> str:
    return SECTOR_TO_NIFTY_GROUP.get(sector, sector or "")


def industry_group(symbol: str | None) -> str:
    return INDUSTRY_GROUP.get(symbol or "", "")


def _clamp(n: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, n))


def _signal_candle(signal: str | None) -> str | None:
    match = re.search(r"C(\d)", signal or "")
    return f"C{match.group(1)}" if match else None


def _traded_value(stock: dict) -> float:
    return (stock.get("ltp") or 0.0) * (stock.get("volume") or 0)


# group -> that sector's mean %change, computed once per snapshot and reused
# by every stock in that group.
def build_sector_means(stocks: list[dict]) -> dict[str, float]:
    groups: dict[str, list[float]] = {}
    for s in stocks:
        group = nifty_group(industry_group(s.get("symbol")))
        groups.setdefault(group, []).append(s.get("pct_change") or 0.0)
    return {group: sum(vals) / len(vals) for group, vals in groups.items() if vals}


def _percentile_rank(value: float, values: list[float]) -> float:
    if not values:
        return 0.0
    below = sum(1 for v in values if v <= value)
    return below / len(values)


def momentum_score(
    stock: dict, all_stocks: list[dict], nifty_pct_change: float, sector_means: dict[str, float]
) -> float:
    """Returns 0 for anything with no signal or fighting the Nifty direction —
    a hard filter — otherwise a 0-100 composite score."""
    signal = stock.get("signal")
    if not signal or signal == "None":
        return 0.0
    is_bull = "Bull" in signal
    aligned_with_nifty = nifty_pct_change >= 0 if is_bull else nifty_pct_change <= 0
    if not aligned_with_nifty:
        return 0.0

    rs_raw = stock.get("relative_strength") or 0.0
    rs_raw = rs_raw if is_bull else -rs_raw
    rs_score = _clamp(rs_raw * 10, 0, 100)

    group = nifty_group(industry_group(stock.get("symbol")))
    sector_mean_pct = sector_means.get(group, 0.0)
    pct_change = stock.get("pct_change") or 0.0
    sector_rs_raw = (pct_change - sector_mean_pct) if is_bull else (sector_mean_pct - pct_change)
    sector_score = _clamp(sector_rs_raw * 10, 0, 100)

    traded_values = [
        _traded_value(s) for s in all_stocks if s.get("signal") and s.get("signal") != "None"
    ]
    vol_score = _percentile_rank(_traded_value(stock), traded_values) * 100

    vwap = stock.get("vwap") or 0.0
    ltp = stock.get("ltp") or 0.0
    vwap_score = (
        100.0 if vwap and ((is_bull and ltp > vwap) or (not is_bull and ltp < vwap)) else 0.0
    )

    freshness_score = FRESHNESS_BY_CANDLE.get(_signal_candle(signal), 0)

    day_range_pos = stock.get("day_range_pos") or 0.0
    extension_score = 100 - abs(day_range_pos - 50) * 2

    return (
        rs_score * WEIGHTS["rs"]
        + sector_score * WEIGHTS["sector"]
        + vol_score * WEIGHTS["volume"]
        + vwap_score * WEIGHTS["vwap"]
        + freshness_score * WEIGHTS["freshness"]
        + _clamp(extension_score, 0, 100) * WEIGHTS["extension"]
    )


def compute_recommended(stocks: list[dict], nifty_pct_change: float) -> list[tuple[str, float]]:
    """Top MAX_PICKS stocks scoring >= CONFIDENCE_FLOOR, highest first."""
    sector_means = build_sector_means(stocks)
    scored = [
        (s["symbol"], momentum_score(s, stocks, nifty_pct_change, sector_means)) for s in stocks
    ]
    qualifying = [pair for pair in scored if pair[1] >= CONFIDENCE_FLOOR]
    qualifying.sort(key=lambda pair: pair[1], reverse=True)
    return qualifying[:MAX_PICKS]
