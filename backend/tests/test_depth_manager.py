"""
Unit tests for depth_manager — pure logic, no Fyers socket required.

Run from backend/:  python -m pytest tests/test_depth_manager.py -v
"""

from app.depth_manager import (
    DEPTH_TOP_N,
    _on_depth_message,
    _score_symbol,
    _select_top_symbols,
    get_book_delta,
    is_depth_subscribed,
    _last_book,
    _depth_set,
    _lock,
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _clear_state():
    """Reset module-level state between tests."""
    with _lock:
        _last_book.clear()
        _depth_set.clear()


def _make_stock(
    symbol="RELIANCE",
    pct_change=0.0,
    relative_strength=0.0,
    signal="None",
    tot_buy_qty=0,
    tot_sell_qty=0,
):
    return {
        "symbol": symbol,
        "pct_change": pct_change,
        "relative_strength": relative_strength,
        "signal": signal,
        "tot_buy_qty": tot_buy_qty,
        "tot_sell_qty": tot_sell_qty,
    }


def _depth_msg(symbol, bids, asks):
    """Build a minimal DepthUpdate message dict."""
    return {
        "symbol": symbol,
        "bids": [{"price": p, "quantity": q} for p, q in bids],
        "asks": [{"price": p, "quantity": q} for p, q in asks],
    }


# ── get_book_delta ────────────────────────────────────────────────────────────

def test_get_book_delta_returns_none_when_no_data():
    _clear_state()
    assert get_book_delta("RELIANCE") is None


def test_get_book_delta_positive_when_bids_dominate():
    _clear_state()
    with _lock:
        _last_book["RELIANCE"] = (100_000.0, 60_000.0)
    assert get_book_delta("RELIANCE") == 40_000.0


def test_get_book_delta_negative_when_asks_dominate():
    _clear_state()
    with _lock:
        _last_book["RELIANCE"] = (50_000.0, 90_000.0)
    assert get_book_delta("RELIANCE") == -40_000.0


def test_get_book_delta_zero_when_balanced():
    _clear_state()
    with _lock:
        _last_book["TCS"] = (75_000.0, 75_000.0)
    assert get_book_delta("TCS") == 0.0


# ── is_depth_subscribed ───────────────────────────────────────────────────────

def test_is_depth_subscribed_false_when_not_in_set():
    _clear_state()
    assert is_depth_subscribed("RELIANCE") is False


def test_is_depth_subscribed_true_when_in_set():
    _clear_state()
    with _lock:
        _depth_set.add("INFY")
    assert is_depth_subscribed("INFY") is True


# ── _on_depth_message (without market_state write) ───────────────────────────

def test_on_depth_message_computes_bid_ask_values():
    _clear_state()
    # Bid: 100×500 + 99×1000 = 149,000
    # Ask: 101×200 + 102×800 = 101,800
    msg = _depth_msg(
        "NSE:RELIANCE-EQ",
        bids=[(100, 500), (99, 1000)],
        asks=[(101, 200), (102, 800)],
    )
    # _on_depth_message does `from .state import market_state` inside the
    # function body, so we patch the object at its source module.
    import unittest.mock as mock
    with mock.patch("app.state.market_state") as ms:
        ms.lock.return_value.__enter__ = lambda s: s
        ms.lock.return_value.__exit__ = mock.Mock(return_value=False)
        ms.get_stock.return_value = {"depth_delta": 0.0}
        _on_depth_message(msg)

    with _lock:
        bid_val, ask_val = _last_book["RELIANCE"]
    assert bid_val == pytest.approx(149_000.0)
    assert ask_val == pytest.approx(101_800.0)


def test_on_depth_message_missing_symbol_is_ignored():
    _clear_state()
    import unittest.mock as mock
    with mock.patch("app.state.market_state"):
        _on_depth_message({"bids": [], "asks": []})  # no 'symbol' key
    with _lock:
        assert len(_last_book) == 0


def test_on_depth_message_empty_book_gives_zero_values():
    _clear_state()
    import unittest.mock as mock
    with mock.patch("app.state.market_state") as ms:
        ms.lock.return_value.__enter__ = lambda s: s
        ms.lock.return_value.__exit__ = mock.Mock(return_value=False)
        ms.get_stock.return_value = {"depth_delta": 0.0}
        _on_depth_message(_depth_msg("NSE:TCS-EQ", bids=[], asks=[]))
    with _lock:
        assert _last_book.get("TCS") == (0.0, 0.0)
    with _lock:
        assert _last_book.get("TCS") == (0.0, 0.0)


# ── _score_symbol ─────────────────────────────────────────────────────────────

def test_score_zero_for_quiet_stock():
    stock = _make_stock(pct_change=0.0, relative_strength=0.0)
    assert _score_symbol(stock, forced_syms=set()) == 0.0


def test_score_forced_paper_position_highest():
    stock = _make_stock(symbol="INFY")
    score = _score_symbol(stock, forced_syms={"INFY"})
    assert score >= 200.0


def test_score_orb_signal_adds_100():
    stock = _make_stock(signal="Bull • C1")
    score_with = _score_symbol(stock, forced_syms=set())
    stock_no_sig = _make_stock(signal="None")
    score_without = _score_symbol(stock_no_sig, forced_syms=set())
    assert score_with - score_without == pytest.approx(100.0)


def test_score_pct_change_adds_proportionally():
    stock = _make_stock(pct_change=4.0)
    score = _score_symbol(stock, forced_syms=set())
    assert score == pytest.approx(abs(4.0) * 5.0)


def test_score_extreme_buy_queue_adds_points():
    # tot_buy_qty = 900, tot_sell_qty = 100 → ratio = 0.9 → abs(0.9-0.5)=0.4 → 0.4*40=16
    stock = _make_stock(tot_buy_qty=900, tot_sell_qty=100)
    score = _score_symbol(stock, forced_syms=set())
    assert score == pytest.approx(16.0)


def test_score_balanced_queue_adds_zero():
    stock = _make_stock(tot_buy_qty=500, tot_sell_qty=500)
    score = _score_symbol(stock, forced_syms=set())
    assert score == pytest.approx(0.0)


# ── DEPTH_TOP_N constant ──────────────────────────────────────────────────────

def test_depth_top_n_is_positive_integer():
    assert isinstance(DEPTH_TOP_N, int) and DEPTH_TOP_N > 0


# ── run all ───────────────────────────────────────────────────────────────────

import pytest  # noqa: E402 — placed after test functions to keep helpers at top


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
