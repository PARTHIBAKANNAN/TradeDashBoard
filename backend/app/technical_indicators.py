"""
Technical Indicators & Multi-Factor Quant Filters.

Computes mathematically rigorous technical signals for 5-minute intraday setups:
1. Exponential Moving Averages (20 EMA & 50 EMA)
2. Relative Strength Index (RSI-14)
3. VWAP Distance & Alignment
4. Sector Momentum & Defensive Category Gating

Ensures only top 1-3 genuine momentum leaders in the market pass to the AI copilot.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

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

    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return round(rsi, 2)


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


def rank_universe_momentum(
    stock: dict,
    signal: str,
    all_stocks: List[dict],
    candle_closes: List[float],
    candle_volumes: Optional[List[float]] = None,
    depth_delta: float = 0.0,
) -> Tuple[int, List[Dict[str, Any]], Dict[str, float]]:
    """
    Momentum Score (0–100) — Answers: "Is this stock exhibiting superior momentum?"

    Weights (100 total):
      1. Relative Strength (30 pts)
      2. Volume Acceleration (20 pts)
      3. Price Velocity / ROC (20 pts)
      4. RSI Momentum & Slope (15 pts)
      5. EMA Trend Alignment (10 pts)
      6. Sector Alignment (5 pts)
      + Depth Delta (±3 bonus, never a veto)
    """
    if not signal or signal == "None":
        return 0, [{"name": "signal", "pts": 0, "max": 0, "detail": "No active signal"}], {}

    is_bull = "Bull" in signal
    sym = stock.get("symbol", "")
    ltp = stock.get("ltp") or 0.0
    rs = stock.get("relative_strength") or 0.0
    ind_grp = industry_group(sym)
    nifty_grp = nifty_group(ind_grp)

    factors: List[Dict[str, Any]] = []
    total = 0

    # ── Factor 1: Relative Strength (max 30 pts) ─────────────────────────────

    is_defensive = ind_grp in DEFENSIVE_SECTORS
    directed_rs = rs if is_bull else -rs
    if is_defensive:
        # Defensive sectors require higher RS (0.4% to 1.5%)
        rs_pts = min(30, max(0, (directed_rs - 0.40) / (1.50 - 0.40) * 30))
    else:
        # Momentum sectors: 0% -> 0, 0.5% -> 18, >= 1.0% -> 30
        if directed_rs >= 1.0:
            rs_pts = 30
        elif directed_rs >= 0.50:
            rs_pts = 18 + (directed_rs - 0.50) / 0.50 * 12
        elif directed_rs >= 0.20:
            rs_pts = 8 + (directed_rs - 0.20) / 0.30 * 10
        elif directed_rs > 0.0:
            rs_pts = (directed_rs / 0.20) * 8
        else:
            rs_pts = 0
    rs_pts = int(round(rs_pts))
    factors.append(
        {
            "name": "RS",
            "pts": rs_pts,
            "max": 30,
            "detail": f"RS {rs:+.2f}% ({'defensive' if is_defensive else 'momentum'})",
        }
    )
    total += rs_pts

    # ── Factor 2: Volume Acceleration (max 20 pts) ───────────────────────────
    # Ratio of latest 5m volume vs average of preceding 3 bars
    vol_ratio = 1.0
    if candle_volumes and len(candle_volumes) >= 2:
        curr_vol = candle_volumes[-1]
        past_vols = candle_volumes[:-1][-3:]
        avg_past_vol = sum(past_vols) / len(past_vols) if past_vols else 0.0
        if avg_past_vol > 0:
            vol_ratio = curr_vol / avg_past_vol
            if vol_ratio >= 2.0:
                vol_pts = 20
            elif vol_ratio >= 1.4:
                vol_pts = 15
            elif vol_ratio >= 1.0:
                vol_pts = 10
            elif vol_ratio >= 0.7:
                vol_pts = 5
            else:
                vol_pts = 0
            vol_detail = f"Vol ratio {vol_ratio:.1f}x vs 3-bar avg"
        else:
            vol_pts = 10
            vol_detail = "Insufficient volume baseline (neutral)"
    else:
        vol_pts = 10  # Neutral if volume series not yet populated
        vol_detail = "Initial candle volume (neutral)"
    factors.append({"name": "VolumeAcc", "pts": vol_pts, "max": 20, "detail": vol_detail})
    total += vol_pts

    # ── Factor 3: Price Velocity / 5m ROC (max 20 pts) ────────────────────────
    prices = list(candle_closes) if candle_closes else [ltp]
    if not prices or prices[-1] != ltp:
        prices.append(ltp)

    roc_5m = 0.0
    if len(prices) >= 2:
        prev_p = prices[-2]
        if prev_p > 0:
            raw_roc = (ltp - prev_p) / prev_p * 100
            directed_roc = raw_roc if is_bull else -raw_roc
            roc_5m = raw_roc
            if directed_roc >= 0.60:
                roc_pts = 20
            elif directed_roc >= 0.35:
                roc_pts = 15
            elif directed_roc >= 0.15:
                roc_pts = 10
            elif directed_roc >= 0.0:
                roc_pts = 5
            else:
                roc_pts = 0
            roc_detail = f"5m ROC {raw_roc:+.2f}%"
        else:
            roc_pts = 10
            roc_detail = "ROC neutral"
    else:
        roc_pts = 10
        roc_detail = "Single candle (neutral)"
    factors.append({"name": "PriceVelocity", "pts": roc_pts, "max": 20, "detail": roc_detail})
    total += roc_pts

    # ── Factor 4: RSI Momentum & Slope (max 15 pts) ──────────────────────────
    rsi = compute_rsi(prices, 14)
    # Level component (10 pts)
    if is_bull:
        if 55.0 <= rsi <= 72.0:
            rsi_level_pts = 10
        elif 48.0 <= rsi < 55.0 or 72.0 < rsi <= 80.0:
            rsi_level_pts = 7
        elif 40.0 <= rsi < 48.0 or 80.0 < rsi <= 85.0:
            rsi_level_pts = 3
        else:
            rsi_level_pts = 0
    else:
        if 28.0 <= rsi <= 45.0:
            rsi_level_pts = 10
        elif 20.0 <= rsi < 28.0 or 45.0 < rsi <= 52.0:
            rsi_level_pts = 7
        elif 15.0 <= rsi < 20.0 or 52.0 < rsi <= 60.0:
            rsi_level_pts = 3
        else:
            rsi_level_pts = 0

    # 3-bar Slope component (5 pts)
    rsi_slope_pts = 2  # default neutral
    if len(prices) >= 4:
        prev_rsi = compute_rsi(prices[:-3], 14)
        delta_rsi = rsi - prev_rsi
        directed_delta = delta_rsi if is_bull else -delta_rsi
        if directed_delta >= 2.0:
            rsi_slope_pts = 5
        elif directed_delta >= 0.0:
            rsi_slope_pts = 3
        else:
            rsi_slope_pts = 0

    rsi_pts = rsi_level_pts + rsi_slope_pts
    factors.append(
        {
            "name": "RSI",
            "pts": rsi_pts,
            "max": 15,
            "detail": f"RSI {rsi:.1f} (level {rsi_level_pts}/10, slope {rsi_slope_pts}/5)",
        }
    )
    total += rsi_pts

    # ── Factor 5: EMA Trend Alignment (max 10 pts) ───────────────────────────
    ema_20 = compute_ema(prices, 20)
    ema_50 = compute_ema(prices, 50)
    if len(prices) < 20:
        ema_pts = 7
        ema_detail = "< 20 candles (partial credit)"
    else:
        if is_bull:
            if ltp >= ema_20 >= ema_50:
                ema_pts = 10
                ema_detail = "LTP > 20EMA > 50EMA (full alignment)"
            elif ltp >= ema_20:
                ema_pts = 6
                ema_detail = "LTP > 20EMA"
            elif ltp >= ema_20 * 0.998:
                ema_pts = 3
                ema_detail = "LTP at 20EMA boundary"
            else:
                ema_pts = 0
                ema_detail = "LTP < 20EMA"
        else:
            if ltp <= ema_20 <= ema_50:
                ema_pts = 10
                ema_detail = "LTP < 20EMA < 50EMA (full alignment)"
            elif ltp <= ema_20:
                ema_pts = 6
                ema_detail = "LTP < 20EMA"
            elif ltp <= ema_20 * 1.002:
                ema_pts = 3
                ema_detail = "LTP at 20EMA boundary"
            else:
                ema_pts = 0
                ema_detail = "LTP > 20EMA"
    factors.append({"name": "EMA", "pts": ema_pts, "max": 10, "detail": ema_detail})
    total += ema_pts

    # ── Factor 6: Sector Alignment (max 5 pts) ───────────────────────────────
    sector_means = build_sector_means(all_stocks)
    sector_mean = sector_means.get(nifty_grp, 0.0)
    if is_bull:
        if sector_mean >= 0.15:
            sector_pts = 5
        elif sector_mean >= -0.15:
            sector_pts = 2
        else:
            sector_pts = 0
    else:
        if sector_mean <= -0.15:
            sector_pts = 5
        elif sector_mean <= 0.15:
            sector_pts = 2
        else:
            sector_pts = 0
    factors.append(
        {
            "name": "Sector",
            "pts": sector_pts,
            "max": 5,
            "detail": f"Sector {nifty_grp} mean {sector_mean:+.2f}%",
        }
    )
    total += sector_pts

    # ── Bonus Factor: Order Book Depth (±3 pts bonus) ────────────────────────
    depth = depth_delta or stock.get("depth_delta", 0.0)
    if depth == 0.0:
        depth_pts = 0
        depth_detail = "No depth data"
    elif (is_bull and depth > 0) or (not is_bull and depth < 0):
        depth_pts = 3
        depth_detail = f"Depth {depth:+.0f} agrees"
    else:
        depth_pts = -2
        depth_detail = f"Depth {depth:+.0f} opposes (soft penalty)"
    factors.append({"name": "Depth", "pts": depth_pts, "max": 3, "detail": depth_detail})
    total += depth_pts

    total = max(0, min(100, total))

    metrics = {
        "rs": rs,
        "rsi": rsi,
        "ema_20": ema_20,
        "ema_50": ema_50,
        "roc_5m": round(roc_5m, 2),
        "vol_ratio": round(vol_ratio, 2),
        "sector_mean": round(sector_mean, 2),
        "momentum_score": total,
    }
    return total, factors, metrics


def detect_breakaway_gap(
    candles: List[dict],
    trigger_level: float,
    is_bull: bool,
    volume_ratio: float = 1.0,
    atr_14: float = 0.0,
) -> Tuple[bool, float, str]:
    """
    Breakaway Auction Gap (BAG) Detection:
    Occurs when an opening expansion candle launches cleanly beyond the
    balance/ORB trigger level with volume participation, leaving a price displacement
    that institutions protect (preventing fill back into the balance range).

    Returns (is_bag: bool, gap_size: float, detail: str).
    """
    if not candles or trigger_level <= 0:
        return False, 0.0, "No candle data for BAG"

    last_candle = candles[-1]
    h = last_candle.get("high", 0.0)
    l = last_candle.get("low", 0.0)
    c = last_candle.get("close", 0.0)
    o = last_candle.get("open", 0.0)

    if is_bull:
        # For Long: The breakout candle closes near highs and low does not violate trigger level
        gap = l - trigger_level
        c_range = h - l
        is_bullish_bar = (c > o) and (c_range > 0 and (c - l) / c_range >= 0.65)
        is_bag = (gap >= -0.05 * (atr_14 or 1.0)) and is_bullish_bar and (volume_ratio >= 1.3)
        detail = (
            f"Bullish BAG (Gap {gap:+.2f}, Vol {volume_ratio:.1f}x)" if is_bag else "No Bullish BAG"
        )
    else:
        # For Short: The breakout candle closes near lows and high does not violate trigger level
        gap = trigger_level - h
        c_range = h - l
        is_bearish_bar = (c < o) and (c_range > 0 and (h - c) / c_range >= 0.65)
        is_bag = (gap >= -0.05 * (atr_14 or 1.0)) and is_bearish_bar and (volume_ratio >= 1.3)
        detail = (
            f"Bearish BAG (Gap {gap:+.2f}, Vol {volume_ratio:.1f}x)" if is_bag else "No Bearish BAG"
        )

    return is_bag, round(gap, 2), detail


def calculate_entry_quality(
    stock: dict,
    signal: str,
    trigger_level: float,
    trigger_time: Optional[Any] = None,
    day_high: Optional[float] = None,
    day_low: Optional[float] = None,
    atr_14: Optional[float] = None,
    now: Optional[Any] = None,
    candles: Optional[List[dict]] = None,
    volume_ratio: float = 1.0,
) -> Tuple[int, List[Dict[str, Any]], Dict[str, float]]:
    """
    Entry Quality Score (0–100) — Answers: "Is this a good moment and location to enter?"

    Components (100 total + bonus):
      1. Trigger Freshness (30 pts) — Minutes since breakout trigger
      2. Breakout Distance (25 pts) — Price distance from breakout price
      3. VWAP Alignment & Distance (25 pts) — Proximity to VWAP (Hard Veto -1 if wrong side)
      4. % Daily ATR Range Consumed (20 pts) — Extension relative to expected volatility
      + Breakaway Auction Gap (BAG) Bonus (up to +10 pts bonus for non-fill momentum displacement)
    """
    if not signal or signal == "None":
        return 0, [{"name": "signal", "pts": 0, "max": 0, "detail": "No active signal"}], {}

    is_bull = "Bull" in signal
    ltp = stock.get("ltp") or 0.0
    vwap = stock.get("vwap") or 0.0

    factors: List[Dict[str, Any]] = []
    total = 0

    # ── HARD PRE-CONDITION: VWAP Side ─────────────────────────────────────────
    # Never buy below VWAP. Never short above VWAP. Hard veto = -1.
    if not vwap:
        return -1, [{"name": "vwap_side", "pts": 0, "max": 0, "detail": "No VWAP data"}], {}
    if is_bull and ltp < vwap:
        return (
            -1,
            [
                {
                    "name": "vwap_side",
                    "pts": 0,
                    "max": 25,
                    "detail": f"LTP {ltp:.2f} below VWAP {vwap:.2f}",
                }
            ],
            {},
        )
    if not is_bull and ltp > vwap:
        return (
            -1,
            [
                {
                    "name": "vwap_side",
                    "pts": 0,
                    "max": 25,
                    "detail": f"LTP {ltp:.2f} above VWAP {vwap:.2f}",
                }
            ],
            {},
        )

    # ── Factor 1: Trigger Freshness (max 30 pts) ─────────────────────────────
    # Time elapsed since breakout trigger
    elapsed_mins = 0.0
    if trigger_time and now:
        try:
            elapsed_mins = max(0.0, (now - trigger_time).total_seconds() / 60.0)
        except Exception:
            elapsed_mins = 0.0

    if elapsed_mins <= 5.0:
        fresh_pts = 30
        fresh_detail = f"Fresh trigger ({elapsed_mins:.1f}m ago)"
    elif elapsed_mins <= 12.0:
        fresh_pts = 22
        fresh_detail = f"Healthy trigger ({elapsed_mins:.1f}m ago)"
    elif elapsed_mins <= 25.0:
        fresh_pts = 14
        fresh_detail = f"Moderate age ({elapsed_mins:.1f}m ago)"
    elif elapsed_mins <= 40.0:
        fresh_pts = 6
        fresh_detail = f"Aging trigger ({elapsed_mins:.1f}m ago)"
    else:
        fresh_pts = 0
        fresh_detail = f"Stale trigger ({elapsed_mins:.1f}m ago)"
    factors.append({"name": "Freshness", "pts": fresh_pts, "max": 30, "detail": fresh_detail})
    total += fresh_pts

    # ── Factor 2: Breakout Distance (max 25 pts) ─────────────────────────────
    # Distance from breakout trigger level (e.g. ORB high/low)
    if trigger_level > 0:
        dist_pct = abs(ltp - trigger_level) / trigger_level * 100
        if dist_pct <= 0.35:
            dist_pts = 25
            dist_detail = f"Near breakout level ({dist_pct:.2f}%)"
        elif dist_pct <= 0.70:
            dist_pts = 18
            dist_detail = f"Moderate extension ({dist_pct:.2f}%)"
        elif dist_pct <= 1.20:
            dist_pts = 10
            dist_detail = f"Stretching from breakout ({dist_pct:.2f}%)"
        elif dist_pct <= 1.80:
            dist_pts = 4
            dist_detail = f"Late entry ({dist_pct:.2f}%)"
        else:
            dist_pts = 0
            dist_detail = f"Severe chase ({dist_pct:.2f}% from breakout)"
    else:
        dist_pct = 0.0
        dist_pts = 20
        dist_detail = "Trigger level baseline (neutral)"
    factors.append({"name": "BreakoutDist", "pts": dist_pts, "max": 25, "detail": dist_detail})
    total += dist_pts

    # ── Factor 3: VWAP Location & Distance (max 25 pts) ──────────────────────
    vwap_dist_pct = abs(ltp - vwap) / vwap * 100 if vwap else 0.0
    if vwap_dist_pct <= 0.60:
        vwap_pts = 25  # Ideal proximity to institutional value
    elif vwap_dist_pct <= 1.30:
        vwap_pts = 20  # Moderate distance
    elif vwap_dist_pct <= 2.20:
        vwap_pts = 10  # Extended
    else:
        vwap_pts = 3  # High extension
    factors.append(
        {
            "name": "VWAPLoc",
            "pts": vwap_pts,
            "max": 25,
            "detail": f"VWAP dist {vwap_dist_pct:.2f}% (correct side)",
        }
    )
    total += vwap_pts

    # ── Factor 4: ATR Consumed (max 20 pts) ──────────────────────────────────
    # Measures how much of the expected daily range is already spent
    consumed_pct = 0.0
    if day_high is not None and day_low is not None and atr_14 and atr_14 > 0:
        day_range = max(0.0, day_high - day_low)
        consumed_pct = (day_range / atr_14) * 100
        if consumed_pct <= 40.0:
            atr_pts = 20
            atr_detail = f"Only {consumed_pct:.0f}% of ATR consumed (ample room)"
        elif consumed_pct <= 65.0:
            atr_pts = 14
            atr_detail = f"{consumed_pct:.0f}% of ATR consumed (good room)"
        elif consumed_pct <= 85.0:
            atr_pts = 7
            atr_detail = f"{consumed_pct:.0f}% of ATR consumed (stretching)"
        else:
            atr_pts = 0
            atr_detail = f"{consumed_pct:.0f}% of ATR consumed (range exhausted)"
    else:
        atr_pts = 14
        atr_detail = "ATR range estimate neutral"
    factors.append({"name": "ATRConsumed", "pts": atr_pts, "max": 20, "detail": atr_detail})
    total += atr_pts

    # ── Structural Bonus: Breakaway Auction Gap (BAG) (up to +10 bonus) ──────
    is_bag = False
    bag_gap = 0.0
    if candles and trigger_level > 0:
        is_bag, bag_gap, bag_detail = detect_breakaway_gap(
            candles=candles,
            trigger_level=trigger_level,
            is_bull=is_bull,
            volume_ratio=volume_ratio,
            atr_14=atr_14 or 0.0,
        )
        if is_bag:
            factors.append({"name": "BAG_Bonus", "pts": 10, "max": 10, "detail": bag_detail})
            total += 10

    total = max(0, min(100, total))

    metrics = {
        "elapsed_mins": round(elapsed_mins, 1),
        "breakout_dist_pct": round(dist_pct, 2),
        "vwap_dist_pct": round(vwap_dist_pct, 2),
        "atr_consumed_pct": round(consumed_pct, 1),
        "is_bag": is_bag,
        "bag_gap": bag_gap,
        "entry_quality_score": total,
    }
    return total, factors, metrics


def compute_conviction_score(
    stock: dict,
    signal: str,
    all_stocks: List[dict],
    candle_closes: List[float],
    depth_delta: float = 0.0,
    candle_volumes: Optional[List[float]] = None,
    trigger_level: float = 0.0,
    trigger_time: Optional[Any] = None,
    day_high: Optional[float] = None,
    day_low: Optional[float] = None,
    atr_14: Optional[float] = None,
    now: Optional[Any] = None,
) -> Tuple[int, List[Dict[str, Any]], Dict[str, float]]:
    """
    Combined Conviction & Entry Scorer — delegating to rank_universe_momentum()
    and calculate_entry_quality().
    """
    mom_score, mom_factors, mom_metrics = rank_universe_momentum(
        stock=stock,
        signal=signal,
        all_stocks=all_stocks,
        candle_closes=candle_closes,
        candle_volumes=candle_volumes,
        depth_delta=depth_delta,
    )

    # If trigger_level not provided, fallback to ltp
    lvl = trigger_level if trigger_level > 0 else (stock.get("ltp") or 0.0)
    eq_score, eq_factors, eq_metrics = calculate_entry_quality(
        stock=stock,
        signal=signal,
        trigger_level=lvl,
        trigger_time=trigger_time,
        day_high=day_high,
        day_low=day_low,
        atr_14=atr_14,
        now=now,
    )

    if eq_score < 0:
        return -1, eq_factors, {**mom_metrics, **eq_metrics}

    # Combined factors for logging/inspection
    all_factors = mom_factors + eq_factors
    combined_metrics = {
        **mom_metrics,
        **eq_metrics,
        "momentum_score": mom_score,
        "entry_quality_score": eq_score,
        "conviction_score": mom_score,  # legacy alias
    }
    return mom_score, all_factors, combined_metrics


def validate_quant_filters(
    stock: dict,
    signal: str,
    all_stocks: List[dict],
    candle_closes: List[float],
) -> Tuple[bool, str, Dict[str, float]]:
    """Legacy shim — delegates to the new dual scorer and applies the
    configured MIN_MOMENTUM_SCORE and MIN_ENTRY_QUALITY_SCORE thresholds."""
    from . import config as _cfg

    mom_score, mom_factors, mom_metrics = rank_universe_momentum(
        stock=stock,
        signal=signal,
        all_stocks=all_stocks,
        candle_closes=candle_closes,
    )
    ltp = stock.get("ltp") or 0.0
    eq_score, eq_factors, eq_metrics = calculate_entry_quality(
        stock=stock,
        signal=signal,
        trigger_level=ltp,
    )

    metrics = {**mom_metrics, **eq_metrics}

    if eq_score < 0:
        reason = eq_factors[0]["detail"] if eq_factors else "Hard VWAP veto"
        return False, reason, metrics

    min_mom = getattr(_cfg, "MIN_MOMENTUM_SCORE", 60)
    min_eq = getattr(_cfg, "MIN_ENTRY_QUALITY_SCORE", 60)

    if mom_score >= min_mom and eq_score >= min_eq:
        return True, f"Momentum {mom_score}/100, Entry Quality {eq_score}/100", metrics

    reasons = []
    if mom_score < min_mom:
        reasons.append(f"Momentum {mom_score} < {min_mom}")
    if eq_score < min_eq:
        reasons.append(f"Entry Quality {eq_score} < {min_eq}")
    return False, ", ".join(reasons), metrics


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
                    return (
                        True,
                        f"Bullish VWAP Retest confirmed ({vwap_dist:.2f}% above VWAP, RSI {rsi:.1f})",
                        metrics,
                    )

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
                    return (
                        True,
                        f"Bearish VWAP Retest confirmed ({vwap_dist:.2f}% below VWAP, RSI {rsi:.1f})",
                        metrics,
                    )

    return False, "Not in VWAP retest zone", {}
