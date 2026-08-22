"""
Pure Trailing Stop Loss & Auto-Breakeven math. Mirrors paper_pnl.py/paper_margin.py:
deterministic, side-effect free, unit-testable in isolation. order_monitor.py drives
these off every tick; the ratchet only ever moves the stop in the trader's favor.
"""


def update_peak(side: str, current_peak: float, ltp: float) -> float:
    if side == "BUY":
        return max(current_peak, ltp)
    return min(current_peak, ltp)


def compute_breakeven_sl(
    side: str,
    entry: float,
    initial_sl: float | None,
    peak: float,
    buffer_pts: float = 0.0,
) -> float | None:
    """
    Computes Auto-Breakeven SL price once trade reaches +1.0R (1x risk distance).
    - Risk R = |entry - initial_sl|
    - For BUY: when peak >= entry + R, breakeven SL = entry + buffer_pts
    - For SELL: when peak <= entry - R, breakeven SL = entry - buffer_pts
    """
    if initial_sl is None or entry <= 0:
        return None
    r_dist = abs(entry - initial_sl)
    if r_dist <= 0:
        return None

    if side == "BUY":
        if peak >= entry + r_dist:
            return round(entry + buffer_pts, 4)
    else:
        if peak <= entry - r_dist:
            return round(entry - buffer_pts, 4)
    return None


def trailing_sl_price(
    side: str,
    entry: float,
    peak: float,
    tsl_type: str,
    tsl_value: float,
    initial_sl: float | None = None,
    enable_breakeven: bool = True,
) -> float:
    """
    Computes candidate trailing SL price:
    - Never tightens the initial structural Stop Loss below initial_sl.
    - If enable_breakeven=True and peak >= +1.0R profit, automatically ratchets
      the minimum stop floor to Entry + Buffer (risk-free trade guarantee).
    - For BUY: only lifts SL above initial_sl/breakeven when peak > entry.
    - For SELL: only lowers SL below initial_sl/breakeven when peak < entry.
    """
    offset = peak * (tsl_value / 100.0) if tsl_type == "PERCENT" else tsl_value
    be_sl = compute_breakeven_sl(side, entry, initial_sl, peak) if enable_breakeven else None

    if side == "BUY":
        if peak <= entry and initial_sl is not None:
            return initial_sl
        trail = peak - offset
        floor_sl = initial_sl
        if be_sl is not None:
            floor_sl = max(floor_sl, be_sl) if floor_sl is not None else be_sl
        return round(max(trail, floor_sl) if floor_sl is not None else trail, 4)
    else:
        if peak >= entry and initial_sl is not None:
            return initial_sl
        trail = peak + offset
        floor_sl = initial_sl
        if be_sl is not None:
            floor_sl = min(floor_sl, be_sl) if floor_sl is not None else be_sl
        return round(min(trail, floor_sl) if floor_sl is not None else trail, 4)


def ratchet_sl(side: str, current_sl: float | None, candidate_sl: float) -> float:
    """Only ever move the stop favorably — up for BUY, down for SELL."""
    if current_sl is None:
        return candidate_sl
    return max(current_sl, candidate_sl) if side == "BUY" else min(current_sl, candidate_sl)

