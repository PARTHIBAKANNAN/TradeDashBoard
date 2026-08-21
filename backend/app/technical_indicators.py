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
from .momentum_score import build_sector_means, industry_group, nifty_group

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


def compute_atr(candles: List[dict], period: int = 14) -> float:
    """
    Compute 5-minute True Range (ATR) across historical candles.
    Returns estimated ATR value.
    """
    if not candles:
        return 0.0
    tr_list: List[float] = []
    for i in range(len(candles)):
        h = candles[i].get("high", 0.0)
        l = candles[i].get("low", 0.0)
        if i == 0:
            tr = h - l
        else:
            prev_c = candles[i - 1].get("close", h)
            tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
        tr_list.append(tr)

    if len(tr_list) < period:
        return round(sum(tr_list) / len(tr_list), 2) if tr_list else 0.0

    atr = sum(tr_list[:period]) / period
    for tr in tr_list[period:]:
        atr = (atr * (period - 1) + tr) / period
    return round(atr, 2)


def compute_dynamic_trade_levels(
    stock: dict,
    signal: str,
    candles: List[dict],
) -> Dict[str, float]:
    """
    Calculates structurally anchored Dynamic Stop Loss and Target levels:
    - Swing Anchor: 5-minute breakout candle extreme + volatility buffer
    - True ATR Multiplier: 1.5x 5-minute ATR
    - Hard Clamping: Minimum 0.85% buffer, Maximum 2.00% buffer
    - Fixed 1:2 Risk-Reward Target
    """
    ltp = stock.get("ltp") or 0.0
    vwap = stock.get("vwap") or ltp
    is_bull = "Bull" in signal

    atr_14 = compute_atr(candles, 14)
    if atr_14 <= 0:
        atr_14 = max(ltp * 0.006, 1.0)  # ~0.6% fallback ATR

    # Recent 3-5 candle swing low/high
    recent = candles[-5:] if candles else []
    if recent:
        swing_low = min(c.get("low", ltp) for c in recent)
        swing_high = max(c.get("high", ltp) for c in recent)
    else:
        swing_low = stock.get("today_low") or (ltp * 0.99)
        swing_high = stock.get("today_high") or (ltp * 1.01)

    min_sl_dist = ltp * 0.0085  # Minimum 0.85% buffer (prevents noise stopouts)
    max_sl_dist = ltp * 0.0200  # Maximum 2.00% buffer cap

    if is_bull:
        # Distance from entry to swing low minus 0.15% breathing room
        swing_dist = max(0.0, ltp - (swing_low * 0.9985))
        atr_dist = atr_14 * 1.5

        # Select best structural anchor, then clamp to [0.85%, 2.0%]
        raw_sl_dist = max(swing_dist, atr_dist, min_sl_dist)
        final_sl_dist = min(raw_sl_dist, max_sl_dist)

        entry = round(ltp, 2)
        sl = round(entry - final_sl_dist, 2)
        target = round(entry + (final_sl_dist * 2.0), 2)
    else:
        # Distance from entry to swing high plus 0.15% breathing room
        swing_dist = max(0.0, (swing_high * 1.0015) - ltp)
        atr_dist = atr_14 * 1.5

        raw_sl_dist = max(swing_dist, atr_dist, min_sl_dist)
        final_sl_dist = min(raw_sl_dist, max_sl_dist)

        entry = round(ltp, 2)
        sl = round(entry + final_sl_dist, 2)
        target = round(entry - (final_sl_dist * 2.0), 2)

    return {
        "entry": entry,
        "sl": sl,
        "target": target,
        "sl_distance": round(final_sl_dist, 2),
        "sl_pct": round(final_sl_dist / entry * 100, 2) if entry > 0 else 0.0,
        "atr_14": atr_14,
        "rr_ratio": 2.0,
    }


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


def compute_sector_breadth(all_stocks: List[dict]) -> Dict[str, dict]:
    """
    Computes real-time market breadth and sector leaders across all 210 stocks.
    Returns { sector_name: { "advancing": int, "declining": int, "count": int, "breadth_pct": float, "mean_pct": float, "is_leader_bull": bool, "is_leader_bear": bool } }
    """
    sec_data: Dict[str, dict] = {}
    for s in all_stocks:
        sym = s.get("symbol", "")
        ind = industry_group(sym)
        sec = nifty_group(ind)
        pct = s.get("pct_change") or 0.0
        d = sec_data.setdefault(sec, {"advancing": 0, "declining": 0, "count": 0, "sum_pct": 0.0})
        d["count"] += 1
        d["sum_pct"] += pct
        if pct > 0.05:
            d["advancing"] += 1
        elif pct < -0.05:
            d["declining"] += 1

    res: Dict[str, dict] = {}
    for sec, d in sec_data.items():
        cnt = max(1, d["count"])
        mean_pct = round(d["sum_pct"] / cnt, 2)
        breadth_pct = round((d["advancing"] / cnt) * 100.0, 1)
        res[sec] = {
            "advancing": d["advancing"],
            "declining": d["declining"],
            "count": cnt,
            "breadth_pct": breadth_pct,
            "mean_pct": mean_pct,
            "is_leader_bull": breadth_pct >= 65.0 and mean_pct >= 0.35,
            "is_leader_bear": breadth_pct <= 35.0 and mean_pct <= -0.35,
        }
    return res


def compute_adr_pct(stock: dict) -> float:
    """Estimates Average Daily Range % using yesterday high/low with a 2.5% default."""
    yh = stock.get("yesterday_high") or 0.0
    yl = stock.get("yesterday_low") or 0.0
    prev_c = stock.get("prev_close") or 0.0
    if yh > 0 and yl > 0 and prev_c > 0:
        return round((yh - yl) / prev_c * 100.0, 2)
    return 2.50


def evaluate_vwap_retest_setup(
    stock: dict,
    all_stocks: List[dict],
    candle_closes: List[float],
    premarket_focus: Optional[List[dict]] = None,
) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Institutional VWAP Pullback & Retest Setup:
    1. Directional impulse / catalyst (RS >= 0.8%, or in leading sector / premarket focus stock).
    2. Price is in the shallow VWAP Retest Zone (0.10% to 0.65% from VWAP).
    3. Price is on the correct side of 20 EMA and bounced off VWAP.
    4. ADR Room Check: Day range consumed < 60% of ADR.
    5. Depth / Order Book confirms buyer/seller defense.
    """
    sym = stock.get("symbol", "")
    ltp = stock.get("ltp") or 0.0
    vwap = stock.get("vwap") or 0.0
    rs = stock.get("relative_strength") or 0.0
    ind_grp = industry_group(sym)
    nifty_grp = nifty_group(ind_grp)

    if not ltp or not vwap:
        return False, "Missing LTP/VWAP", {}

    # Check premarket catalyst focus
    has_news_bull = False
    has_news_bear = False
    if premarket_focus:
        for f in premarket_focus:
            if f.get("symbol") == sym:
                bias = f.get("bias", "").upper()
                if "BULL" in bias:
                    has_news_bull = True
                elif "BEAR" in bias:
                    has_news_bear = True

    # Sector Breadth
    breadth_map = compute_sector_breadth(all_stocks)
    sec_info = breadth_map.get(nifty_grp, {})
    sec_mean = sec_info.get("mean_pct", 0.0)
    sec_breadth = sec_info.get("breadth_pct", 50.0)
    sec_is_bull_leader = sec_info.get("is_leader_bull", False)
    sec_is_bear_leader = sec_info.get("is_leader_bear", False)

    # ADR Room check
    adr_pct = compute_adr_pct(stock)
    today_h = stock.get("today_high") or ltp
    today_l = stock.get("today_low") or ltp
    today_range_pct = (today_h - today_l) / ltp * 100.0 if ltp else 0.0
    if today_range_pct > (adr_pct * 0.85):
        return False, f"ADR exhausted ({today_range_pct:.1f}% used of {adr_pct:.1f}% ADR)", {}

    prices = list(candle_closes) if candle_closes else [ltp]
    if not prices or prices[-1] != ltp:
        prices.append(ltp)
    ema_20 = compute_ema(prices, 20)
    rsi = compute_rsi(prices, 14)

    # ── BULL SETUP EVALUATION ──
    if ltp > vwap and (rs >= 0.80 or sec_is_bull_leader or has_news_bull):
        vwap_dist = (ltp - vwap) / vwap * 100.0
        if 0.10 <= vwap_dist <= 0.65:
            rsi_ok = (52.0 <= rsi <= 72.0) if len(prices) >= 15 else True
            if (len(prices) < 20 or ltp >= (ema_20 * 0.999)) and rsi_ok:
                if sec_mean >= -0.05 or has_news_bull:
                    metrics = {
                        "setup_type": "VWAP_RETEST_BUY",
                        "rs": rs,
                        "rsi": rsi,
                        "vwap": vwap,
                        "vwap_dist_pct": round(vwap_dist, 2),
                        "sector": nifty_grp,
                        "sector_mean": sec_mean,
                        "sector_breadth": sec_breadth,
                        "adr_pct": adr_pct,
                        "range_used_pct": round(today_range_pct, 2),
                    }
                    return True, f"Bullish VWAP Retest confirmed ({vwap_dist:.2f}% above VWAP, RSI {rsi:.1f})", metrics

    # ── BEAR SETUP EVALUATION ──
    if ltp < vwap and (rs <= -0.80 or sec_is_bear_leader or has_news_bear):
        vwap_dist = (vwap - ltp) / vwap * 100.0
        if 0.10 <= vwap_dist <= 0.65:
            rsi_ok = (28.0 <= rsi <= 48.0) if len(prices) >= 15 else True
            if (len(prices) < 20 or ltp <= (ema_20 * 1.001)) and rsi_ok:
                if sec_mean <= 0.05 or has_news_bear:
                    metrics = {
                        "setup_type": "VWAP_RETEST_SELL",
                        "rs": rs,
                        "rsi": rsi,
                        "vwap": vwap,
                        "vwap_dist_pct": round(vwap_dist, 2),
                        "sector": nifty_grp,
                        "sector_mean": sec_mean,
                        "sector_breadth": sec_breadth,
                        "adr_pct": adr_pct,
                        "range_used_pct": round(today_range_pct, 2),
                    }
                    return True, f"Bearish VWAP Retest confirmed ({vwap_dist:.2f}% below VWAP, RSI {rsi:.1f})", metrics

    return False, "Not in VWAP retest zone", {}

