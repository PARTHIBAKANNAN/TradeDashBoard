"""
Standalone checks for paper-trading P&L math. Run from backend/:

    python -m tests.test_paper_pnl
"""

from app.paper_pnl import realized_pnl, unrealized_pnl


def test_unrealized_pnl_buy():
    assert unrealized_pnl("BUY", 10, 100.0, 110.0) == 100.0
    assert unrealized_pnl("BUY", 10, 100.0, 90.0) == -100.0


def test_unrealized_pnl_sell():
    assert unrealized_pnl("SELL", 10, 100.0, 90.0) == 100.0
    assert unrealized_pnl("SELL", 10, 100.0, 110.0) == -100.0


def test_unrealized_pnl_flat():
    assert unrealized_pnl("BUY", 10, 100.0, 100.0) == 0.0


def test_realized_pnl_matches_unrealized_at_exit():
    assert realized_pnl("BUY", 5, 200.0, 220.0) == unrealized_pnl("BUY", 5, 200.0, 220.0)
    assert realized_pnl("SELL", 5, 200.0, 180.0) == unrealized_pnl("SELL", 5, 200.0, 180.0)


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
