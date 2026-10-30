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


def test_compute_breakeven_sl_buy():
    from app.trailing_stop import compute_breakeven_sl

    # Entry 1000, Initial SL 980 (Risk R = 20 pts).
    # When Peak < 1020 (< +1R), breakeven is not triggered yet -> None
    assert compute_breakeven_sl("BUY", 1000.0, 980.0, 1015.0) is None

    # When Peak >= 1020 (+1R hit!), breakeven SL is clamped to Entry -> 1000.0
    be_sl = compute_breakeven_sl("BUY", 1000.0, 980.0, 1020.0)
    assert be_sl == 1000.0

    # With optional buffer (e.g. 1.0 pt) -> 1001.0
    be_sl_buf = compute_breakeven_sl("BUY", 1000.0, 980.0, 1020.0, buffer_pts=1.0)
    assert be_sl_buf == 1001.0


def test_compute_breakeven_sl_sell():
    from app.trailing_stop import compute_breakeven_sl

    # Entry 1000, Initial SL 1020 (Risk R = 20 pts).
    # When Peak > 980 (< +1R), breakeven is not triggered -> None
    assert compute_breakeven_sl("SELL", 1000.0, 1020.0, 985.0) is None

    # When Peak <= 980 (+1R hit!), breakeven SL is clamped to Entry -> 1000.0
    be_sl = compute_breakeven_sl("SELL", 1000.0, 1020.0, 980.0)
    assert be_sl == 1000.0


def test_trailing_sl_price_with_breakeven():
    # Buy: Entry 1000, Initial SL 980 (1R = 20).
    # Peak reaches 1025. With a wide 3% TSL (1025 - 30.75 = 994.25 which is below entry),
    # Auto-Breakeven guarantees the stop floor is ratcheted up to at least 1000.0!
    sl = trailing_sl_price(
        "BUY", 1000.0, 1025.0, "PERCENT", 3.0, initial_sl=980.0, enable_breakeven=True
    )
    assert sl >= 1000.0


def test_delayed_trailing_stop_activation():
    # SELL: Entry 872.90, Initial SL 881.46 (R = 8.56 pts).
    # When price only dips to 870.00 (+0.34R profit), trailing stop MUST NOT ratchet tighter than initial SL!
    sl_minor_dip = trailing_sl_price(
        "SELL", 872.90, 870.00, "PERCENT", 0.90, initial_sl=881.46, enable_breakeven=True
    )
    assert sl_minor_dip == 881.46, f"Expected initial SL 881.46 preserved, got {sl_minor_dip}"

    # BUY: Entry 1000.0, Initial SL 980.0 (R = 20 pts).
    # When price only moves to 1005.0 (+0.25R profit), trailing stop MUST NOT ratchet tighter!
    sl_minor_rise = trailing_sl_price(
        "BUY", 1000.0, 1005.0, "PERCENT", 0.90, initial_sl=980.0, enable_breakeven=True
    )
    assert sl_minor_rise == 980.0, f"Expected initial SL 980.0 preserved, got {sl_minor_rise}"


def test_staged_rung_trailing_stop():
    # BUY: Entry 1000.0, Initial SL 980.0 (Risk R = 20 pts).
    # Stage 0: Peak 1010.0 (+0.5R, < 0.8R) -> Initial SL 980.0 preserved!
    assert trailing_sl_price("BUY", 1000.0, 1010.0, "PERCENT", 1.0, initial_sl=980.0) == 980.0

    # Stage 1: Peak 1020.0 (+1.0R, in [0.8R, 1.5R)) -> Auto-Breakeven at 1000.0!
    assert trailing_sl_price("BUY", 1000.0, 1020.0, "PERCENT", 1.0, initial_sl=980.0) == 1000.0

    # Stage 2: Peak 1032.0 (+1.6R, in [1.5R, 2.0R)) -> Profit Harvest at 1000 + 0.75*20 = 1015.0!
    assert trailing_sl_price("BUY", 1000.0, 1032.0, "PERCENT", 1.0, initial_sl=980.0) == 1015.0

    # Stage 3: Peak 1050.0 (+2.5R, >= 2.0R) -> At least +1.2R (1024.0) and trails peak (1050 - 1% = 1039.5)!
    assert trailing_sl_price("BUY", 1000.0, 1050.0, "PERCENT", 1.0, initial_sl=980.0) == 1039.5

    # SELL: Entry 1000.0, Initial SL 1020.0 (Risk R = 20 pts).
    # Stage 0: Peak 990.0 (+0.5R) -> Initial SL 1020.0 preserved
    assert trailing_sl_price("SELL", 1000.0, 990.0, "PERCENT", 1.0, initial_sl=1020.0) == 1020.0

    # Stage 1: Peak 980.0 (+1.0R) -> Auto-Breakeven at 1000.0
    assert trailing_sl_price("SELL", 1000.0, 980.0, "PERCENT", 1.0, initial_sl=1020.0) == 1000.0

    # Stage 2: Peak 968.0 (+1.6R) -> Profit Harvest at 1000 - 0.75*20 = 985.0
    assert trailing_sl_price("SELL", 1000.0, 968.0, "PERCENT", 1.0, initial_sl=1020.0) == 985.0

    # Stage 3: Peak 950.0 (+2.5R) -> At least +1.2R (976.0) and trails peak (950 + 1% = 959.5)!
    assert trailing_sl_price("SELL", 1000.0, 950.0, "PERCENT", 1.0, initial_sl=1020.0) == 959.5


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
