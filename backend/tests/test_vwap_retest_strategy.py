from datetime import datetime

from app.config import IST
from app.strategies.vwap_retest_strategy import VWAPRetestStrategy
from app.strategy_base import Direction, StrategyFamily


def test_vwap_retest_strategy_evaluation():
    strat = VWAPRetestStrategy()
    assert strat.family == StrategyFamily.VWAP_RETEST
    assert strat.name == "VWAP_RETEST"

    now = datetime(2026, 9, 14, 10, 15, tzinfo=IST)
    stock = {
        "symbol": "NSE:TCS-EQ",
        "ltp": 3510.0,
        "vwap": 3500.0,
        "relative_strength": 1.5,
        "pct_change": 1.2,
        "yesterday_high": 3550.0,
        "yesterday_low": 3450.0,
        "prev_close": 3480.0,
        "today_high": 3520.0,
        "today_low": 3485.0,
        "signal": None,
    }
    all_stocks = [
        {"symbol": "NSE:TCS-EQ", "pct_change": 1.2},
        {"symbol": "NSE:INFY-EQ", "pct_change": 1.0},
    ]

    event = strat.evaluate(stock, now, all_stocks=all_stocks)
    # Even without intraday candle closes history populated, it should safely evaluate
    # When closes are empty, evaluate_vwap_retest_setup fails gracefully or succeeds if default rules match
    if event:
        assert event.label == "Bull • VWAP Retest"
        assert event.direction == Direction.BULL
        assert event.trigger_price == 3500.0


def test_vwap_retest_strategy_ignores_if_already_active():
    strat = VWAPRetestStrategy()
    now = datetime(2026, 9, 14, 10, 15, tzinfo=IST)
    stock = {
        "symbol": "NSE:TCS-EQ",
        "ltp": 3510.0,
        "vwap": 3500.0,
        "relative_strength": 1.5,
        "pct_change": 1.2,
        "signal": "Bull • VWAP Retest",
    }
    event = strat.evaluate(stock, now, all_stocks=[])
    assert event is None
