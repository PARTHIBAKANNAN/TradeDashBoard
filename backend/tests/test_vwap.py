"""
Standalone checks for the VWAP accumulator. Run from backend/:

    python -m tests.test_vwap
"""

from app.calculations import update_vwap


def test_first_tick_seeds_vwap():
    cum_pv, cum_vol, vwap = update_vwap(0.0, 0, 0, 100, 50.0)
    assert cum_pv == 5000.0
    assert cum_vol == 100
    assert vwap == 50.0


def test_accumulates_across_multiple_ticks():
    cum_pv, cum_vol, vwap = update_vwap(0.0, 0, 0, 100, 50.0)
    cum_pv, cum_vol, vwap = update_vwap(cum_pv, cum_vol, 100, 150, 60.0)
    assert cum_vol == 150
    assert cum_pv == 5000.0 + 50 * 60.0  # 8000
    assert vwap == round(8000.0 / 150, 4)


def test_duplicate_tick_is_a_zero_delta_noop():
    cum_pv, cum_vol, vwap = update_vwap(0.0, 0, 0, 100, 50.0)
    # Same total volume again (a stale/duplicate frame) — ltp here should not
    # move the running average at all.
    cum_pv2, cum_vol2, vwap2 = update_vwap(cum_pv, cum_vol, 100, 100, 9999.0)
    assert (cum_pv2, cum_vol2) == (cum_pv, cum_vol)
    assert vwap2 == vwap


def test_volume_decrease_is_treated_as_zero_delta():
    cum_pv, cum_vol, vwap = update_vwap(0.0, 0, 0, 100, 50.0)
    # A lower "cumulative" volume than before should never happen, but must not
    # corrupt the running sums (e.g. via a negative delta) if it does.
    cum_pv2, cum_vol2, vwap2 = update_vwap(cum_pv, cum_vol, 100, 80, 10.0)
    assert (cum_pv2, cum_vol2) == (cum_pv, cum_vol)
    assert vwap2 == vwap


def test_no_volume_yet_returns_zero_vwap():
    cum_pv, cum_vol, vwap = update_vwap(0.0, 0, 0, 0, 50.0)
    assert (cum_pv, cum_vol, vwap) == (0.0, 0, 0.0)


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
