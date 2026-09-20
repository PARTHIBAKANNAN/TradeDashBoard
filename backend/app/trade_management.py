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
        prev_close = candles[i-1]["close"]
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

def calculate_initial_stops(sym: str, side: str, entry: float) -> dict:
    """
    Computes directional stop prices.
    Returns {
        "sl_price": float,
        "tsl_value": float, # for percent-based trailing stop if needed
        "target_price": float # optional
    }
    """
    candles = candle_aggregator.get_intraday_candles(sym)
    
    atr = compute_atr(candles)
    if atr == 0:
        atr = entry * 0.005  # Fallback 0.5% if not enough data
        
    structural_level = compute_structural_level(candles, side)
    buffer = atr * 0.2  # 20% of ATR as buffer for structural stops
    
    # directional stop prices
    max_risk_pct = 0.015  # Max 1.5% risk distance cap
    
    if side == "BUY":
        atr_stop = entry - (1.5 * atr)
        struct_stop = (structural_level - buffer) if structural_level > 0 else atr_stop
        
        # We want the stop to be at structural support, but not further than 1.5 ATR
        # and DEFINITELY not further than the max risk cap.
        ideal_sl = max(struct_stop, atr_stop)
        
        # Hard floor cap
        min_sl = entry * (1.0 - max_risk_pct)
        sl_price = max(ideal_sl, min_sl)
        
        # Safety check: must be below entry
        if sl_price >= entry:
            sl_price = entry - atr
    else:
        atr_stop = entry + (1.5 * atr)
        struct_stop = (structural_level + buffer) if structural_level > 0 else atr_stop
        
        ideal_sl = min(struct_stop, atr_stop)
        
        max_sl = entry * (1.0 + max_risk_pct)
        sl_price = min(ideal_sl, max_sl)
        
        if sl_price <= entry:
            sl_price = entry + atr

    # R-based trade management (Experiments)
    # The trailing logic handles the +1R breakeven automatically (Experiment A).
    # Since we are using R-multiples, we'll set a standard TSL percent as a backup, 
    # but the `trailing_stop.py` logic handles the breakeven ratchet.
    
    risk_dist = abs(entry - sl_price)
    target = entry + (3 * risk_dist) if side == "BUY" else entry - (3 * risk_dist) # 3R target
    
    # We pass tsl_type="PERCENT" with a tight trail (e.g. 0.90%) as requested.
    return {
        "sl_price": round(sl_price, 2),
        "target_price": round(target, 2),
        "tsl_type": "PERCENT",
        "tsl_value": 0.90
    }
