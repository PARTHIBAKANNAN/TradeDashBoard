"""
Standalone checks for the math engines. Run from backend/:

    python -m tests.test_calculations
"""

from datetime import datetime

from app.calculations import (day_range_position, evaluate_orb,
                              intraday_relative_strength, orb_quality,
                              pct_change, range_map)
from app.config import IST


def approx(a, b, tol=1e-6):
    return abs(a - b) <= tol


def test_pct_change():
    assert approx(pct_change(3690.0, 3630.0), 1.65)
    assert pct_change(100, 0) == 0.0


def test_irs():
    # stock +1.65%, index -0.33% -> outperform by 1.98
    assert approx(intraday_relative_strength(1.65, -0.33), 1.98)
    # underperform case
    assert intraday_relative_strength(-2.23, -0.33) < 0


def test_day_range_position():
    assert approx(day_range_position(3650, 3600, 3700), 50.0)
    assert day_range_position(3650, 3650, 3650) == 0.0  # zero span guard


def test_range_map():
    # yesterday 3580-3690, today 3600-3700, ltp 3690
    r = range_map(3580, 3690, 3600, 3700, 3690)
    assert approx(r["yesterday"]["low"], 0.0)  # global min
    assert approx(r["today"]["high"], 100.0)  # global max
    assert 0 <= r["ltp_pos"] <= 100
    assert r["yesterday"]["raw_high"] == 3690


def test_orb_breakout():
    now = datetime(2026, 7, 8, 10, 0, tzinfo=IST)  # after C1 (09:15-09:45)
    orb = {"C1": {"high": 3650.0, "low": 3610.0}}
    # bull breakout above C1 high
    sig, t = evaluate_orb(orb, 3660.0, now, "None")
    assert sig == "Bull • C1" and t == "10:00"
    # no re-trigger for the same state
    sig2, _ = evaluate_orb(orb, 3665.0, now, "Bull • C1")
    assert sig2 is None
    # bear breakout below C1 low
    sig3, _ = evaluate_orb(orb, 3600.0, now, "Bull • C1")
    assert sig3 == "Bear • C1"
    # inside range -> no signal
    sig4, _ = evaluate_orb(orb, 3630.0, now, "None")
    assert sig4 is None


def test_orb_precedence():
    # After 10:15 both C1 and C2 complete; newer completed candle wins.
    now = datetime(2026, 7, 8, 10, 30, tzinfo=IST)
    orb = {"C1": {"high": 3650.0, "low": 3610.0}, "C2": {"high": 3680.0, "low": 3660.0}}
    sig, _ = evaluate_orb(orb, 3690.0, now, "None")  # above C2 high
    assert sig == "Bull • C2"


def test_orb_quality():
    # Candles: [ts, open, high, low, close, volume]. Needs >=1 red, >=1 green,
    # and no candle after the first with a lower low than the first.
    good = [
        [0, 100, 102, 99, 101, 0],  # green, sets the low bar at 99
        [1, 101, 103, 100, 99.5, 0],  # red
        [2, 99.5, 104, 99.2, 103, 0],  # green
        [3, 103, 105, 101, 102, 0],  # red
        [4, 102, 106, 100.5, 105, 0],  # green
        [5, 105, 107, 103, 106, 0],  # green
    ]
    assert orb_quality(good) is True

    # Fewer than 6 candles -> incomplete data, not qualified.
    assert orb_quality(good[:5]) is False

    # A later candle prints a low below the first candle's low -> fails rule 2.
    broken_low = [list(c) for c in good]
    broken_low[3][3] = 98.0  # first candle's low was 99
    assert orb_quality(broken_low) is False

    # All-green candles (no red at all) -> fails rule 3.
    all_green = [[i, 100 + i, 101 + i, 99 + i, 100.5 + i, 0] for i in range(6)]
    assert orb_quality(all_green) is False


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
