"""
Standalone checks for paper-trading margin/sizing math. Run from backend/:

    python -m tests.test_paper_margin
"""

from app.paper_margin import INTRADAY_LEVERAGE, max_affordable_qty, required_margin


def test_required_margin():
    assert required_margin(100.0, 10) == 200.0  # (100*10)/5
    assert required_margin(3690.5, 20) == round((3690.5 * 20) / INTRADAY_LEVERAGE, 2)


def test_max_affordable_qty():
    # balance 10000, leverage 5 -> 50000 buying power / ltp 100 -> 500 shares
    assert max_affordable_qty(10000.0, 100.0) == 500
    assert max_affordable_qty(0.0, 100.0) == 0


def test_max_affordable_qty_zero_ltp_guard():
    assert max_affordable_qty(10000.0, 0.0) == 0


def test_margin_and_qty_are_inverse_at_boundary():
    balance = 10000.0
    ltp = 3690.5
    qty = max_affordable_qty(balance, ltp)
    assert required_margin(ltp, qty) <= balance
    assert required_margin(ltp, qty + 1) > balance


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
