"""
Technical Indicators & Multi-Factor Quant Filters.

Computes mathematically rigorous technical signals for 5-minute intraday setups:
1. Exponential Moving Averages (20 EMA & 50 EMA)
2. Relative Strength Index (RSI-14)
3. VWAP Distance & Alignment
4. Sector Momentum & Defensive Category Gating

Ensures only top 1-3 genuine momentum leaders in the market pass to the AI copilot.
"""

from typing import Dict, List, Optional, Tuple
from .config import INDUSTRY_GROUP
from .momentum_score import nifty_group, industry_group, build_sector_means

# Defensive, low-beta sectors that tend to chop/mean-revert intraday.
# These require an exceptional catalyst (RS >= 2.0%) to be considered.
DEFENSIVE_SECTORS = {
    "FMCG",
    "PSU Banks",
    "Consumer",
    "Cement",
}

# High-beta, momentum-rich sectors suited for intraday trend continuation.
MOMENTUM_SECTORS = {
    "Auto",
    "IT",
    "Metals",
    "Realty",
    "Pvt Banks",
    "NBFC",
    "Capital Goods",
    "Energy",
    "Pharma",
    "Healthcare",
    "Infra",
}


def compute_ema(prices: List[float], period: int) -> float:
    """
    Exponential Moving Average over a price series.
    Returns the latest EMA value, or the latest price if insufficient data.
    """
    if not prices:
        return 0.0
    if len(prices) < period:
        return prices[-1]
    k = 2.0 / (period + 1)
    ema = sum(prices[:period]) / period
    for p in prices[period:]:
        ema = (p * k) + (ema * (1.0 - k))
    return round(ema, 2)


def compute_rsi(prices: List[float], period: int = 14) -> float:
    """
    Standard 14-period Relative Strength Index (Wilder's Smoothing).
    Returns 50.0 (neutral) if insufficient historical candles.
    """
    if not prices or len(prices) < period + 1:
        return 50.0

    gains: List[float] = []
    losses: List[float] = []
    for i in range(1, len(prices)):
        diff = prices[i] - prices[i - 1]
        if diff >= 0:
            gains.append(diff)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(abs(diff))

    if len(gains) < period:
        return 50.0

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0

    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return round(rsi, 2)


def validate_quant_filters(
    stock: dict,
    signal: str,
    all_stocks: List[dict],
    candle_closes: List[float],
) -> Tuple[bool, str, Dict[str, float]]:
    """
    Strict 4-tier Quant Gatekeeper.
    Returns (passes: bool, reason: str, metrics: dict).
    """
    if not signal or signal == "None":
        return False, "No active breakout signal", {}

    is_bull = "Bull" in signal
    sym = stock.get("symbol", "")
    ltp = stock.get("ltp") or 0.0
    vwap = stock.get("vwap") or 0.0
    rs = stock.get("relative_strength") or 0.0
    ind_grp = industry_group(sym)
    nifty_grp = nifty_group(ind_grp)

    # ── Tier 1: Sector & Defensive Gating ─────────────────────────────────────
    # Defensive names (FMCG, PSU Banks, Cement) need RS >= 2.0% to avoid sideways traps.
    # Regular momentum sectors need RS >= 1.0% vs NIFTY.
    is_defensive = ind_grp in DEFENSIVE_SECTORS
    min_rs_required = 2.0 if is_defensive else 1.0

    if is_bull and rs < min_rs_required:
        return (
            False,
            f"RS {rs:+.2f}% is below {min_rs_required:.1f}% threshold for {ind_grp}",
            {"rs": rs},
        )
    if not is_bull and rs > -min_rs_required:
        return (
            False,
            f"RS {rs:+.2f}% is above {-min_rs_required:.1f}% threshold for {ind_grp}",
            {"rs": rs},
        )

    # Sector alignment: verify sector mean return agrees with trade direction
    sector_means = build_sector_means(all_stocks)
    sector_mean = sector_means.get(nifty_grp, 0.0)
    if is_bull and sector_mean < -0.10:
        return (
            False,
            f"Sector {nifty_grp} is dragging at {sector_mean:+.2f}%",
            {"sector_mean": sector_mean},
        )
    if not is_bull and sector_mean > 0.10:
        return (
            False,
            f"Sector {nifty_grp} is lifting at {sector_mean:+.2f}%",
            {"sector_mean": sector_mean},
        )

    # ── Tier 2: VWAP Alignment & Non-Extension Buffer ────────────────────────
    # Price must be on the right side of VWAP and within [0.15%, 1.2%] buffer.
    if not vwap:
        return False, "No VWAP data available", {}

    if is_bull:
        if ltp <= vwap:
            return False, f"LTP (₹{ltp:.2f}) is below VWAP (₹{vwap:.2f})", {}
        vwap_dist_pct = (ltp - vwap) / vwap * 100
        if vwap_dist_pct < 0.10:
            return False, f"Price too close to VWAP ({vwap_dist_pct:.2f}%)", {}
        if vwap_dist_pct > 1.20:
            return False, f"Price over-extended from VWAP ({vwap_dist_pct:.2f}% > 1.2%)", {}
    else:
        if ltp >= vwap:
            return False, f"LTP (₹{ltp:.2f}) is above VWAP (₹{vwap:.2f})", {}
        vwap_dist_pct = (vwap - ltp) / vwap * 100
        if vwap_dist_pct < 0.10:
            return False, f"Price too close to VWAP ({vwap_dist_pct:.2f}%)", {}
        if vwap_dist_pct > 1.20:
            return False, f"Price over-extended below VWAP ({vwap_dist_pct:.2f}% > 1.2%)", {}

    # ── Tier 3: 5-Minute Technical Indicators (EMA & RSI) ────────────────────
    prices = list(candle_closes) if candle_closes else [ltp]
    if not prices or prices[-1] != ltp:
        prices.append(ltp)

    rsi = compute_rsi(prices, 14)
    ema_20 = compute_ema(prices, 20)
    ema_50 = compute_ema(prices, 50)

    # RSI momentum zone checks:
    # BUY: RSI must be 55.0 to 72.0 (strong momentum, not overbought)
    # SELL: RSI must be 28.0 to 45.0 (breakdown acceleration, not oversold)
    if is_bull:
        if rsi < 55.0:
            return False, f"5m RSI is weak ({rsi:.1f} < 55.0)", {"rsi": rsi}
        if rsi > 72.0:
            return False, f"5m RSI is overbought ({rsi:.1f} > 72.0)", {"rsi": rsi}
    else:
        if rsi > 45.0:
            return False, f"5m RSI is weak ({rsi:.1f} > 45.0)", {"rsi": rsi}
        if rsi < 28.0:
            return False, f"5m RSI is oversold ({rsi:.1f} < 28.0)", {"rsi": rsi}

    # EMA trend alignment checks (if enough candles present):
    if len(prices) >= 20:
        if is_bull and ltp < ema_20:
            return False, f"LTP (₹{ltp:.2f}) is below 20 EMA (₹{ema_20:.2f})", {"ema_20": ema_20}
        if not is_bull and ltp > ema_20:
            return False, f"LTP (₹{ltp:.2f}) is above 20 EMA (₹{ema_20:.2f})", {"ema_20": ema_20}

    metrics = {
        "rs": rs,
        "rsi": rsi,
        "ema_20": ema_20,
        "ema_50": ema_50,
        "vwap": vwap,
        "vwap_dist_pct": round(vwap_dist_pct, 2),
        "sector_mean": round(sector_mean, 2),
    }
    return True, "All technical indicators confirmed", metrics
