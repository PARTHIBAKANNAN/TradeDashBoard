"""
Virtual intraday margin/sizing for paper trading. A simple, explicitly
approximate flat-leverage model — this is a simulation, not a real broker
margin calculator (FYERS' real per-stock margin API is a different surface
we don't have access to and won't rely on).
"""

INTRADAY_LEVERAGE = 5  # flat approximation of typical MIS equity leverage


def required_margin(entry_price: float, quantity: int) -> float:
    return round((entry_price * quantity) / INTRADAY_LEVERAGE, 2)


def max_affordable_qty(available_balance: float, ltp: float) -> int:
    """How many whole shares of this stock the user's current free balance can margin right now."""
    if ltp <= 0:
        return 0
    return int((available_balance * INTRADAY_LEVERAGE) // ltp)
