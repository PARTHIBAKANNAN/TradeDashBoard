"""
Pure Trailing Stop Loss & Auto-Breakeven math. Mirrors paper_pnl.py/paper_margin.py:
deterministic, side-effect free, unit-testable in isolation. order_monitor.py drives
these off every tick; the ratchet only ever moves the stop in the trader's favor.
"""


def update_peak(side: str, current_peak: float, ltp: float) -> float:
    if side == "BUY":
        return max(current_peak, ltp)
    return min(current_peak, ltp)


def update_mae(side: str, current_mae: float, ltp: float) -> float:
    if side == "BUY":
        return min(current_mae, ltp)
    return max(current_mae, ltp)


def compute_breakeven_sl(
    side: str,
    entry: float,
    initial_sl: float | None,
    peak: float,
    buffer_pts: float = 0.0,
    r_mult_threshold: float = 0.8,
) -> float | None:
    """
    Computes Auto-Breakeven SL price once trade reaches +0.8R (0.8x risk distance).
    - Risk R = |entry - initial_sl|
    - For BUY: when peak >= entry + 0.8 * R, breakeven SL = entry + buffer_pts
    - For SELL: when peak <= entry - 0.8 * R, breakeven SL = entry - buffer_pts
    """
    if initial_sl is None or entry <= 0:
        return None
    r_dist = abs(entry - initial_sl)
    if r_dist <= 0:
        return None

    if side == "BUY":
        if peak >= entry + (r_mult_threshold * r_dist):
            return round(entry + buffer_pts, 4)
    else:
        if peak <= entry - (r_mult_threshold * r_dist):
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
    buffer_pts: float = 0.0,
) -> float:
    """
    Computes candidate trailing SL price with Staged Rung activation:
    - Stage 0 (Breathing Room): Until peak reaches at least +0.8R profit,
      the stop loss remains anchored at initial_sl to prevent noise stopouts.
    - Stage 1 (Auto-Breakeven): At +0.8R to +1.5R, moves stop to Entry (+ buffer).
    - Stage 2 (Profit Harvest): At +1.5R to +2.0R, locks in at least +0.75R profit.
    - Stage 3 (Swing Runner): Beyond +2.0R, locks in at least +1.2R and trails peak.
    """
    if initial_sl is not None and entry > 0:
        r_dist = abs(entry - initial_sl)
        if r_dist > 0:
            # ── Stage 0: Full structural breathing room until +0.8R ──────────
            if side == "BUY" and peak < (entry + 0.8 * r_dist):
                return initial_sl
            elif side == "SELL" and peak > (entry - 0.8 * r_dist):
                return initial_sl

            # ── Stage 1: Auto-Breakeven (+0.8R to < +1.5R) ────────────────────
            if side == "BUY" and peak < (entry + 1.5 * r_dist):
                be_sl = entry + buffer_pts if enable_breakeven else initial_sl
                return round(max(initial_sl, be_sl), 4)
            elif side == "SELL" and peak > (entry - 1.5 * r_dist):
                be_sl = entry - buffer_pts if enable_breakeven else initial_sl
                return round(min(initial_sl, be_sl), 4)

            # ── Stage 2: Profit Harvest (+1.5R to < +2.0R) ────────────────────
            if side == "BUY" and peak < (entry + 2.0 * r_dist):
                harvest_sl = entry + (0.75 * r_dist)
                return round(max(initial_sl, harvest_sl), 4)
            elif side == "SELL" and peak > (entry - 2.0 * r_dist):
                harvest_sl = entry - (0.75 * r_dist)
                return round(min(initial_sl, harvest_sl), 4)

    # ── Stage 3: Swing Runner (Beyond +2.0R) or default trailing ─────────────
    offset = peak * (tsl_value / 100.0) if tsl_type == "PERCENT" else tsl_value
    be_sl = (
        compute_breakeven_sl(side, entry, initial_sl, peak, buffer_pts=buffer_pts)
        if enable_breakeven
        else None
    )

    if side == "BUY":
        if peak <= entry and initial_sl is not None:
            return initial_sl
        trail = peak - offset
        floor_sl = initial_sl
        if initial_sl is not None and entry > 0:
            r_dist = abs(entry - initial_sl)
            floor_sl = max(floor_sl, entry + 1.2 * r_dist)
        if be_sl is not None:
            floor_sl = max(floor_sl, be_sl) if floor_sl is not None else be_sl
        return round(max(trail, floor_sl) if floor_sl is not None else trail, 4)
    else:
        if peak >= entry and initial_sl is not None:
            return initial_sl
        trail = peak + offset
        floor_sl = initial_sl
        if initial_sl is not None and entry > 0:
            r_dist = abs(entry - initial_sl)
            floor_sl = min(floor_sl, entry - 1.2 * r_dist)
        if be_sl is not None:
            floor_sl = min(floor_sl, be_sl) if floor_sl is not None else be_sl
        return round(min(trail, floor_sl) if floor_sl is not None else trail, 4)


def ratchet_sl(side: str, current_sl: float | None, candidate_sl: float) -> float:
    """Only ever move the stop favorably — up for BUY, down for SELL."""
    if current_sl is None:
        return candidate_sl
    return max(current_sl, candidate_sl) if side == "BUY" else min(current_sl, candidate_sl)
