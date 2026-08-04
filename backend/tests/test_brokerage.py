"""
Standalone checks for brokerage/tax charge calculation. Run from backend/:

    python -m tests.test_brokerage
"""

from app.brokerage import compute_charges


def test_buy_round_trip_charges_stamp_duty_on_entry_stt_on_exit():
    # BUY 10 @ 100 (entry, turnover 1000) -> SELL 10 @ 110 (exit, turnover 1100)
    c = compute_charges("BUY", 10, 100.0, 110.0)
    assert c["stamp_duty"] == round(1000.0 * 0.00015, 2)  # buy leg = entry
    assert c["stt"] == round(1100.0 * 0.00025, 2)  # sell leg = exit


def test_sell_round_trip_charges_stt_on_entry_stamp_duty_on_exit():
    # SELL 10 @ 110 (entry/short, turnover 1100) -> BUY 10 @ 100 (exit/cover, turnover 1000)
    c = compute_charges("SELL", 10, 110.0, 100.0)
    assert c["stt"] == round(1100.0 * 0.00025, 2)  # sell leg = entry
    assert c["stamp_duty"] == round(1000.0 * 0.00015, 2)  # buy leg = exit


def test_brokerage_is_capped_on_large_turnover():
    # entry turnover = 100 * 10,000 = 1,000,000 -> 0.03% would be 300, capped at 20
    c = compute_charges("BUY", 10_000, 100.0, 100.0)
    assert c["brokerage"] == 40.0  # capped at 20 per leg, two legs


def test_gst_applies_only_to_brokerage_and_exchange_charges():
    c = compute_charges("BUY", 10, 100.0, 110.0)
    expected_gst = round((c["brokerage"] + c["exchange_charges"]) * 0.18, 2)
    assert c["gst"] == expected_gst
    # sanity: gst must be strictly less than 18% of the full total (since it's
    # not computed on stt/sebi/stamp duty too)
    assert c["gst"] < round(c["total_charges"] * 0.18, 2)


def test_total_charges_is_the_sum_of_all_components():
    c = compute_charges("BUY", 10, 100.0, 110.0)
    expected = round(
        c["brokerage"] + c["stt"] + c["exchange_charges"] + c["sebi_charges"] + c["stamp_duty"] + c["gst"],
        2,
    )
    assert c["total_charges"] == expected


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
