"""
Standalone checks for live-tick ORB derivation. Run from backend/:

    python -m tests.test_candle_aggregator
"""

from datetime import datetime

from app.candle_aggregator import on_tick
from app.config import IST


def _stock(symbol):
    return {
        "symbol": symbol,
        "orb": {},
        "candle1_high": 0.0,
        "candle1_low": 0.0,
        "two_sided_ok": False,
    }


def _t(h, m):
    return datetime(2026, 8, 3, h, m, tzinfo=IST)


def test_orb_bounds_track_high_low_within_window():
    stock = _stock("AAA")
    on_tick(stock, 100.0, _t(9, 16))
    on_tick(stock, 105.0, _t(9, 20))
    on_tick(stock, 98.0, _t(9, 30))
    assert stock["orb"]["C1"] == {"high": 105.0, "low": 98.0}


def test_orb_windows_are_independent():
    stock = _stock("BBB")
    on_tick(stock, 100.0, _t(9, 20))  # C1
    on_tick(stock, 200.0, _t(9, 50))  # C2
    assert stock["orb"]["C1"] == {"high": 100.0, "low": 100.0}
    assert stock["orb"]["C2"] == {"high": 200.0, "low": 200.0}


def test_two_sided_range_detected_at_opening_range_end():
    stock = _stock("CCC")
    # Six 5-min buckets, 09:15-09:45, alternating red/green.
    on_tick(stock, 100.0, _t(9, 15))
    on_tick(stock, 102.0, _t(9, 19))  # bucket 1: green (100 -> 102)
    on_tick(stock, 102.0, _t(9, 20))
    on_tick(stock, 99.0, _t(9, 24))  # bucket 2: red (102 -> 99)
    on_tick(stock, 99.0, _t(9, 25))
    on_tick(stock, 101.0, _t(9, 29))  # bucket 3: green
    on_tick(stock, 101.0, _t(9, 30))
    on_tick(stock, 100.5, _t(9, 34))  # bucket 4: red
    on_tick(stock, 100.5, _t(9, 35))
    on_tick(stock, 103.0, _t(9, 39))  # bucket 5: green
    on_tick(stock, 103.0, _t(9, 40))
    on_tick(stock, 102.0, _t(9, 44))  # bucket 6: red
    # First tick past 09:45 triggers finalize.
    on_tick(stock, 102.5, _t(9, 45))
    assert stock["two_sided_ok"] is True
    assert stock["candle1_high"] == 102.0  # bucket 1's high (100->102)
    assert stock["candle1_low"] == 100.0


def test_all_green_opening_range_fails_quality_gate():
    stock = _stock("DDD")
    price = 100.0
    for m in (15, 20, 25, 30, 35, 40):
        price += 1
        on_tick(stock, price, _t(9, m))
    on_tick(stock, price + 1, _t(9, 45))
    assert stock["two_sided_ok"] is False


def test_incomplete_opening_range_fails_closed():
    stock = _stock("EEE")
    # Only 3 of the 6 buckets ever tick.
    on_tick(stock, 100.0, _t(9, 15))
    on_tick(stock, 101.0, _t(9, 25))
    on_tick(stock, 99.0, _t(9, 35))
    on_tick(stock, 100.5, _t(9, 45))
    assert stock["two_sided_ok"] is False


def test_symbols_do_not_interfere():
    a, b = _stock("FFF"), _stock("GGG")
    on_tick(a, 50.0, _t(9, 20))
    on_tick(b, 500.0, _t(9, 20))
    assert a["orb"]["C1"]["high"] == 50.0
    assert b["orb"]["C1"]["high"] == 500.0


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
