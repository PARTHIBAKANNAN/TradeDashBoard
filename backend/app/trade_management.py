"""
Trade Management: Stop Loss, Targets, and Trailing rules (Phase 3).
"""

from . import candle_aggregator


def compute_atr(candles: list[dict], period: int = 14) -> float:
    if len(candles) < 2:
        return 0.0

    trs = []
    for i in range(1, len(candles)):
        high = candles[i]["high"]
        low = candles[i]["low"]
        prev_close = candles[i - 1]["close"]
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        trs.append(tr)

    if not trs:
        return 0.0

    # Simple moving average of TR
    period = min(period, len(trs))
    return sum(trs[-period:]) / period


def compute_structural_level(candles: list[dict], side: str, lookback: int = 6) -> float:
    """Finds the lowest low (for BUY) or highest high (for SELL) over the recent candles."""
    if not candles:
        return 0.0

    recent = candles[-lookback:]
    if side == "BUY":
        return min(c["low"] for c in recent)
    else:
        return max(c["high"] for c in recent)


def check_support_resistance_proximity(
    stock: dict, side: str, entry: float, threshold_pct: float = 0.003
) -> tuple[bool, str]:
    """
    Anti-trap guard: Prevents shorting directly into major prior-day support,
    or buying directly into prior-day resistance (the trap that caught SOLARINDS).
    Returns (is_safe, reason).
    """
    if entry <= 0:
        return True, "Valid entry"

    if side == "SELL":
        y_low = float(stock.get("yesterday_low") or 0.0)
        if y_low > 0 and entry >= y_low and ((entry - y_low) / entry) < threshold_pct:
            return False, f"Near prior-day support (₹{y_low:.2f}), high bounce/bear-trap risk"
    elif side == "BUY":
        y_high = float(stock.get("yesterday_high") or 0.0)
        if y_high > 0 and entry <= y_high and ((y_high - entry) / entry) < threshold_pct:
            return (
                False,
                f"Near prior-day resistance (₹{y_high:.2f}), high rejection/bull-trap risk",
            )

    return True, "Clear of immediate structural barriers"


def calculate_initial_stops(sym: str, side: str, entry: float) -> dict:
    """
    Computes directional stop prices with structural anchoring and safety clamping:
    - Minimum 0.85% risk floor (prevents sub-tick noise stopouts and micro-targets)
    - Maximum 2.00% risk cap (prevents catastrophic gap drawdown)
    - Primary 1:2.0 Risk-Reward Target
    """
    if entry <= 0:
        return {
            "sl_price": 0.0,
            "target_price": 0.0,
            "tsl_type": "PERCENT",
            "tsl_value": 0.90,
            "sl_distance": 0.0,
        }

    candles = candle_aggregator.get_intraday_candles(sym)

    atr = compute_atr(candles)
    if atr <= 0:
        atr = max(entry * 0.0075, 1.0)  # ~0.75% fallback ATR

    structural_level = compute_structural_level(candles, side)
    buffer = atr * 0.2  # 20% of ATR buffer

    min_risk_pct = 0.0085  # Minimum 0.85% floor
    max_risk_pct = 0.0200  # Maximum 2.00% cap

    min_sl_dist = entry * min_risk_pct
    max_sl_dist = entry * max_risk_pct

    if side == "BUY":
        atr_stop = entry - (1.5 * atr)
        struct_stop = (structural_level - buffer) if structural_level > 0 else atr_stop
        # Structural support or ATR stop
        ideal_sl = min(struct_stop, atr_stop) if struct_stop > 0 else atr_stop
        raw_dist = (entry - ideal_sl) if ideal_sl < entry else min_sl_dist
        final_dist = round(min(max(raw_dist, min_sl_dist), max_sl_dist), 2)
        sl_price = round(entry - final_dist, 2)
        target = round(entry + (2.0 * final_dist), 2)
    else:
        atr_stop = entry + (1.5 * atr)
        struct_stop = (structural_level + buffer) if structural_level > 0 else atr_stop
        ideal_sl = max(struct_stop, atr_stop) if struct_stop > 0 else atr_stop
        raw_dist = (ideal_sl - entry) if ideal_sl > entry else min_sl_dist
        final_dist = round(min(max(raw_dist, min_sl_dist), max_sl_dist), 2)

        sl_price = round(entry + final_dist, 2)
        target = round(entry - (2.0 * final_dist), 2)

    risk_dist = round(abs(entry - sl_price), 2)
    tsl_pct = max(0.90, round(final_dist / entry * 100, 2))

    return {
        "sl_price": round(sl_price, 2),
        "target_price": round(target, 2),
        "tsl_type": "PERCENT",
        "tsl_value": tsl_pct,
        "sl_distance": risk_dist,
    }
