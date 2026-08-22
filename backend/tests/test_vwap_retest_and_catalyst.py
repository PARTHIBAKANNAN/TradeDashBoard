"""
Unit tests for VWAP Retest Setup, Sector Breadth, and Premarket Catalyst matching.
Run with:
    python -m pytest backend/tests/test_vwap_retest_and_catalyst.py -v
"""

from app.technical_indicators import (compute_adr_pct, compute_sector_breadth,
                                      evaluate_vwap_retest_setup)


def test_compute_sector_breadth():
    stocks = [
        {"symbol": "NSE:TCS-EQ", "pct_change": 1.2},
        {"symbol": "NSE:INFY-EQ", "pct_change": 0.8},
        {"symbol": "NSE:WIPRO-EQ", "pct_change": -0.4},
        {"symbol": "NSE:TATASTEEL-EQ", "pct_change": -1.5},
    ]
    res = compute_sector_breadth(stocks)
    assert "NIFTY IT" in res
    assert res["NIFTY IT"]["count"] == 3
    assert res["NIFTY IT"]["advancing"] == 2
    assert res["NIFTY IT"]["declining"] == 1
    assert round(res["NIFTY IT"]["breadth_pct"], 1) == 66.7
    assert res["NIFTY IT"]["is_leader_bull"] is True


def test_compute_adr_pct():
    stock = {"yesterday_high": 105.0, "yesterday_low": 100.0, "prev_close": 100.0}
    assert compute_adr_pct(stock) == 5.0


def test_evaluate_vwap_retest_setup_bull():
    stock = {
        "symbol": "NSE:TCS-EQ",
        "ltp": 3510.0,
        "vwap": 3500.0,  # 0.28% above VWAP
        "relative_strength": 1.5,
        "pct_change": 1.2,
        "yesterday_high": 3550.0,
        "yesterday_low": 3450.0,
        "prev_close": 3480.0,
        "today_high": 3520.0,
        "today_low": 3485.0,
    }
    all_stocks = [
        {"symbol": "NSE:TCS-EQ", "pct_change": 1.2},
        {"symbol": "NSE:INFY-EQ", "pct_change": 1.0},
    ]
    # Candle closes supporting 20 EMA
    candle_closes = [3490.0, 3495.0, 3502.0, 3508.0, 3510.0]
    passes, msg, metrics = evaluate_vwap_retest_setup(stock, all_stocks, candle_closes)
    assert passes is True
    assert metrics["setup_type"] == "VWAP_RETEST_BUY"
    assert 0.10 <= metrics["vwap_dist_pct"] <= 0.65


def test_evaluate_vwap_retest_setup_exhausted_adr():
    stock = {
        "symbol": "NSE:TCS-EQ",
        "ltp": 3510.0,
        "vwap": 3500.0,
        "relative_strength": 1.5,
        "pct_change": 1.2,
        "yesterday_high": 3510.0,
        "yesterday_low": 3500.0,
        "prev_close": 3500.0,  # ADR is ~0.28%
        "today_high": 3550.0,
        "today_low": 3450.0,  # Range used is ~2.8% (way over ADR)
    }
    all_stocks = [{"symbol": "NSE:TCS-EQ", "pct_change": 1.2}]
    passes, msg, metrics = evaluate_vwap_retest_setup(stock, all_stocks, [3510.0])
    assert passes is False
    assert "ADR exhausted" in msg


def test_fetch_multi_stream_news():
    from app.ai_copilot import fetch_multi_stream_news

    news = fetch_multi_stream_news()
    assert isinstance(news, dict)
    assert "Global Macro & US Tech" in news
    assert "Indian Corporate & Stocks" in news


def test_get_premarket_briefing_schema():
    from app.ai_copilot import get_premarket_briefing

    briefing = get_premarket_briefing()
    assert "bias" in briefing
    assert "global_cues" in briefing
    assert "policy_and_macro_watch" in briefing
    assert "leading_sectors" in briefing
    assert "focus_stocks" in briefing
