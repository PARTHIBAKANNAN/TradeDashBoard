"""
Pure Trailing Stop Loss math. Mirrors paper_pnl.py/paper_margin.py: deterministic,
side-effect free, unit-testable in isolation. order_monitor.py drives these off
every tick; the ratchet only ever moves the stop in the trader's favor.
"""


def update_peak(side: str, current_peak: float, ltp: float) -> float:
    if side == "BUY":
        return max(current_peak, ltp)
    return min(current_peak, ltp)


def trailing_sl_price(side: str, peak: float, tsl_type: str, tsl_value: float) -> float:
    offset = peak * (tsl_value / 100) if tsl_type == "PERCENT" else tsl_value
    return round(peak - offset, 4) if side == "BUY" else round(peak + offset, 4)


def ratchet_sl(side: str, current_sl: float | None, candidate_sl: float) -> float:
    """Only ever move the stop favorably — up for BUY, down for SELL."""
    if current_sl is None:
        return candidate_sl
    return max(current_sl, candidate_sl) if side == "BUY" else min(current_sl, candidate_sl)
