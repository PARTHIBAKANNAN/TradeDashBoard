"""
Standalone checks for trailing-stop math. Run from backend/:

    python -m tests.test_trailing_stop
"""

from app.trailing_stop import ratchet_sl, trailing_sl_price, update_peak


def test_update_peak_buy():
    assert update_peak("BUY", 100.0, 105.0) == 105.0
    assert update_peak("BUY", 100.0, 95.0) == 100.0  # never retreats


def test_update_peak_sell():
    assert update_peak("SELL", 100.0, 95.0) == 95.0
    assert update_peak("SELL", 100.0, 105.0) == 100.0  # never retreats


def test_trailing_sl_price_percent():
    # BUY: entry 200, peak 205, 1% below peak -> 202.95
    assert trailing_sl_price("BUY", 200.0, 205.0, "PERCENT", 1.0, 198.0) == 202.95
    # BUY: entry 200, peak 200 (no move), initial SL 198 preserved -> 198.0
    assert trailing_sl_price("BUY", 200.0, 200.0, "PERCENT", 1.0, 198.0) == 198.0
    # SELL: entry 200, peak 195, 1% above peak -> 196.95
    assert trailing_sl_price("SELL", 200.0, 195.0, "PERCENT", 1.0, 202.0) == 196.95
    # SELL: entry 200, peak 200 (no move), initial SL 202 preserved -> 202.0
    assert trailing_sl_price("SELL", 200.0, 200.0, "PERCENT", 1.0, 202.0) == 202.0


def test_trailing_sl_price_points():
    assert trailing_sl_price("BUY", 200.0, 220.0, "POINTS", 20.0, 180.0) == 200.0
    assert trailing_sl_price("SELL", 200.0, 180.0, "POINTS", 20.0, 220.0) == 200.0


def test_ratchet_sl_buy_never_retreats():
    assert ratchet_sl("BUY", None, 180.0) == 180.0
    assert ratchet_sl("BUY", 180.0, 190.0) == 190.0  # price ran up -> stop follows
    assert ratchet_sl("BUY", 190.0, 185.0) == 190.0  # pullback -> stop holds, does not retreat


def test_ratchet_sl_sell_never_retreats():
    assert ratchet_sl("SELL", None, 220.0) == 220.0
    assert ratchet_sl("SELL", 220.0, 210.0) == 210.0  # price fell further -> stop follows down
    assert ratchet_sl("SELL", 210.0, 215.0) == 210.0  # bounce -> stop holds, does not retreat


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
