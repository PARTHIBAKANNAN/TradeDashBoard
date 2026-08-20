"""
Pure Trailing Stop Loss math. Mirrors paper_pnl.py/paper_margin.py: deterministic,
side-effect free, unit-testable in isolation. order_monitor.py drives these off
every tick; the ratchet only ever moves the stop in the trader's favor.
"""


def update_peak(side: str, current_peak: float, ltp: float) -> float:
    if side == "BUY":
        return max(current_peak, ltp)
    return min(current_peak, ltp)


def trailing_sl_price(
    side: str,
    entry: float,
    peak: float,
    tsl_type: str,
    tsl_value: float,
    initial_sl: float | None = None,
) -> float:
    """
    Computes candidate trailing SL price:
    - Never tightens the initial structural Stop Loss below entry.
    - For BUY: only lifts SL above initial_sl when peak > entry.
    - For SELL: only lowers SL below initial_sl when peak < entry.
    """
    offset = peak * (tsl_value / 100.0) if tsl_type == "PERCENT" else tsl_value
    if side == "BUY":
        if peak <= entry and initial_sl is not None:
            return initial_sl
        trail = peak - offset
        return round(max(trail, initial_sl) if initial_sl is not None else trail, 4)
    else:
        if peak >= entry and initial_sl is not None:
            return initial_sl
        trail = peak + offset
        return round(min(trail, initial_sl) if initial_sl is not None else trail, 4)


def ratchet_sl(side: str, current_sl: float | None, candidate_sl: float) -> float:
    """Only ever move the stop favorably — up for BUY, down for SELL."""
    if current_sl is None:
        return candidate_sl
    return max(current_sl, candidate_sl) if side == "BUY" else min(current_sl, candidate_sl)

