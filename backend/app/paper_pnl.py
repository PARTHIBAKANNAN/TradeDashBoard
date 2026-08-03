"""
Pure P&L math for paper (simulated) orders. Mirrors the style of
calculations.py: deterministic, side-effect free, unit-testable in isolation.
"""


def unrealized_pnl(side: str, quantity: int, entry_price: float, ltp: float) -> float:
    direction = 1 if side == "BUY" else -1
    return round(direction * (ltp - entry_price) * quantity, 2)


def realized_pnl(side: str, quantity: int, entry_price: float, exit_price: float) -> float:
    return unrealized_pnl(side, quantity, entry_price, exit_price)
