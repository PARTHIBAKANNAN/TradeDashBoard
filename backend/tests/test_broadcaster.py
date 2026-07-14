"""
Tests for the pure frame differ. No asyncio, no sockets — just dict math.
Run from backend/:  python -m tests.test_broadcaster
"""
from app.broadcaster import (
    DIFFABLE_STOCK_FIELDS,
    SNAPSHOT_STOCK_FIELDS,
    build_frame,
)


def _stock(symbol="RELIANCE", ltp=100.0, pct_change=0.0, day_range_pos=50.0):
    return {
        "symbol": symbol, "sector": "Energy",
        "ltp": ltp, "pct_change": pct_change,
        "relative_strength": 0.0, "day_range_pos": day_range_pos,
        "signal": "None", "signal_time": "",
        "yesterday_low": 90.0, "yesterday_high": 110.0,
        "today_low": 95.0, "today_high": 105.0,
    }


def _snapshot(stocks=None, nifty_ltp=100.0, market_open=True, fyers_connected=True):
    return {
        "market_open": market_open,
        "fyers_connected": fyers_connected,
        "nifty": {"symbol": "NIFTY50", "ltp": nifty_ltp, "prev_close": 100.0, "pct_change": 0.0},
        "stocks": {s["symbol"]: s for s in (stocks or [_stock()])},
    }


def test_first_frame_is_a_full_snapshot():
    curr = _snapshot()
    frame = build_frame(prev=None, curr=curr, seq=1)
    assert frame["type"] == "snapshot"
    assert frame["seq"] == 1
    assert frame["market_open"] is True
    assert frame["fyers_connected"] is True
    assert frame["nifty"]["ltp"] == 100.0
    assert isinstance(frame["stocks"], list) and len(frame["stocks"]) == 1
    assert set(SNAPSHOT_STOCK_FIELDS).issubset(frame["stocks"][0].keys())


def test_identical_snapshots_produce_no_frame():
    s = _snapshot()
    assert build_frame(prev=s, curr=s, seq=5) is None


def test_single_stock_changed_produces_minimal_delta():
    prev = _snapshot([_stock(ltp=100.0, pct_change=0.0)])
    curr = _snapshot([_stock(ltp=101.5, pct_change=1.5)])
    frame = build_frame(prev=prev, curr=curr, seq=2)
    assert frame["type"] == "delta"
    assert frame["seq"] == 2
    assert "nifty" not in frame        # nifty unchanged -> omitted
    assert len(frame["stocks"]) == 1
    entry = frame["stocks"][0]
    # Only 'symbol' key + the fields that changed.
    assert entry["symbol"] == "RELIANCE"
    assert entry["ltp"] == 101.5
    assert entry["pct_change"] == 1.5
    # Fields that didn't change must NOT be present:
    for field in DIFFABLE_STOCK_FIELDS:
        if field not in ("ltp", "pct_change"):
            assert field not in entry, f"{field} leaked into delta"


def test_delta_includes_nifty_only_when_it_changes():
    prev = _snapshot(nifty_ltp=100.0)
    curr = _snapshot(nifty_ltp=100.5)
    frame = build_frame(prev=prev, curr=curr, seq=3)
    assert frame["type"] == "delta"
    assert frame["nifty"]["ltp"] == 100.5
    # No stocks changed -> stocks list is empty (still a valid delta because nifty moved).
    assert frame["stocks"] == []


def test_market_open_flag_flip_is_included():
    prev = _snapshot(market_open=True)
    curr = _snapshot(market_open=False)
    frame = build_frame(prev=prev, curr=curr, seq=4)
    assert frame["type"] == "delta"
    assert frame["market_open"] is False


def test_force_snapshot_returns_snapshot_even_when_unchanged():
    s = _snapshot()
    frame = build_frame(prev=s, curr=s, seq=9, force_snapshot=True)
    assert frame is not None
    assert frame["type"] == "snapshot"
    assert frame["seq"] == 9


def test_unknown_new_symbol_appears_in_delta():
    prev = _snapshot([_stock(symbol="RELIANCE")])
    curr = _snapshot([_stock(symbol="RELIANCE"), _stock(symbol="TCS", ltp=4200.0)])
    frame = build_frame(prev=prev, curr=curr, seq=6)
    assert frame["type"] == "delta"
    syms = {e["symbol"] for e in frame["stocks"]}
    assert "TCS" in syms
    tcs = next(e for e in frame["stocks"] if e["symbol"] == "TCS")
    # New symbol: emit all snapshot fields so the client can render immediately.
    assert set(SNAPSHOT_STOCK_FIELDS).issubset(tcs.keys())


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
