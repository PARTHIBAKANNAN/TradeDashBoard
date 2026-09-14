from datetime import datetime

from app.config import IST
from app.strategies.sector_sympathy_strategy import SectorSympathyStrategy
from app.strategy_base import Direction, StrategyFamily


def test_sector_sympathy_strategy_properties():
    strat = SectorSympathyStrategy()
    assert strat.family == StrategyFamily.SECTOR_SYMPATHY
    assert strat.name == "SECTOR_SYMPATHY"


def test_sector_sympathy_strategy_bull_signal():
    strat = SectorSympathyStrategy()
    now = datetime(2026, 9, 14, 10, 30, tzinfo=IST)

    # IT sector: TCS is leader (+2.5%), INFY is laggard (+0.5%), WIPRO is (+1.0%), HCLTECH is (+1.2%)
    # Sector mean = (2.5 + 0.5 + 1.0 + 1.2)/4 = 1.3%
    # Breadth = 4/4 = 100%
    # Leader threshold = 1.3 * 1.5 = 1.95%. TCS at 2.5% is leader!
    # Laggard range for bull: 0 < pct < 1.3 * 0.6 = 0.78%. INFY at 0.5% qualifies!
    all_stocks = [
        {
            "symbol": "NSE:TCS-EQ",
            "pct_change": 2.5,
            "ltp": 3600.0,
            "vwap": 3580.0,
            "prev_close": 3500.0,
            "today_high": 3610.0,
            "today_low": 3570.0,
            "yesterday_high": 3550.0,
            "yesterday_low": 3450.0,
        },
        {
            "symbol": "NSE:INFY-EQ",
            "pct_change": 0.5,
            "ltp": 1510.0,
            "vwap": 1505.0,
            "relative_strength": 0.3,
            "prev_close": 1500.0,
            "today_high": 1512.0,
            "today_low": 1500.0,
            "yesterday_high": 1530.0,
            "yesterday_low": 1470.0,
        },
        {
            "symbol": "NSE:WIPRO-EQ",
            "pct_change": 1.0,
            "ltp": 450.0,
            "vwap": 448.0,
            "prev_close": 445.0,
            "today_high": 452.0,
            "today_low": 446.0,
            "yesterday_high": 460.0,
            "yesterday_low": 440.0,
        },
        {
            "symbol": "NSE:HCLTECH-EQ",
            "pct_change": 1.2,
            "ltp": 1600.0,
            "vwap": 1590.0,
            "prev_close": 1580.0,
            "today_high": 1605.0,
            "today_low": 1585.0,
            "yesterday_high": 1610.0,
            "yesterday_low": 1550.0,
        },
    ]

    candidate = all_stocks[1]  # INFY
    event = strat.evaluate(candidate, now, all_stocks=all_stocks)
    assert event is not None
    assert event.label == "Bull • Sector Lag"
    assert event.direction == Direction.BULL
    assert event.strategy_family == StrategyFamily.SECTOR_SYMPATHY
    assert event.symbol == "NSE:INFY-EQ"
    assert event.trigger_price == 1505.0


def test_sector_sympathy_rejects_if_no_leader():
    strat = SectorSympathyStrategy()
    now = datetime(2026, 9, 14, 10, 30, tzinfo=IST)

    # All stocks at +0.5%, no breakout leader (no stock >= 1.5 * mean)
    all_stocks = [
        {
            "symbol": "NSE:TCS-EQ",
            "pct_change": 0.5,
            "ltp": 3600.0,
            "vwap": 3580.0,
            "prev_close": 3500.0,
            "today_high": 3610.0,
            "today_low": 3570.0,
            "yesterday_high": 3550.0,
            "yesterday_low": 3450.0,
        },
        {
            "symbol": "NSE:INFY-EQ",
            "pct_change": 0.5,
            "ltp": 1510.0,
            "vwap": 1505.0,
            "relative_strength": 0.3,
            "prev_close": 1500.0,
            "today_high": 1512.0,
            "today_low": 1500.0,
            "yesterday_high": 1530.0,
            "yesterday_low": 1470.0,
        },
        {
            "symbol": "NSE:WIPRO-EQ",
            "pct_change": 0.5,
            "ltp": 450.0,
            "vwap": 448.0,
            "prev_close": 445.0,
            "today_high": 452.0,
            "today_low": 446.0,
            "yesterday_high": 460.0,
            "yesterday_low": 440.0,
        },
        {
            "symbol": "NSE:HCLTECH-EQ",
            "pct_change": 0.5,
            "ltp": 1600.0,
            "vwap": 1590.0,
            "prev_close": 1580.0,
            "today_high": 1605.0,
            "today_low": 1585.0,
            "yesterday_high": 1610.0,
            "yesterday_low": 1550.0,
        },
    ]

    candidate = all_stocks[1]
    event = strat.evaluate(candidate, now, all_stocks=all_stocks)
    assert event is None


def test_sector_sympathy_rejects_if_ltp_below_vwap():
    strat = SectorSympathyStrategy()
    now = datetime(2026, 9, 14, 10, 30, tzinfo=IST)

    all_stocks = [
        {
            "symbol": "NSE:TCS-EQ",
            "pct_change": 2.5,
            "ltp": 3600.0,
            "vwap": 3580.0,
            "prev_close": 3500.0,
            "today_high": 3610.0,
            "today_low": 3570.0,
            "yesterday_high": 3550.0,
            "yesterday_low": 3450.0,
        },
        {
            "symbol": "NSE:INFY-EQ",
            "pct_change": 0.5,
            "ltp": 1490.0,
            "vwap": 1505.0,
            "relative_strength": 0.3,
            "prev_close": 1500.0,
            "today_high": 1512.0,
            "today_low": 1480.0,
            "yesterday_high": 1530.0,
            "yesterday_low": 1470.0,
        },
        {
            "symbol": "NSE:WIPRO-EQ",
            "pct_change": 1.0,
            "ltp": 450.0,
            "vwap": 448.0,
            "prev_close": 445.0,
            "today_high": 452.0,
            "today_low": 446.0,
            "yesterday_high": 460.0,
            "yesterday_low": 440.0,
        },
        {
            "symbol": "NSE:HCLTECH-EQ",
            "pct_change": 1.2,
            "ltp": 1600.0,
            "vwap": 1590.0,
            "prev_close": 1580.0,
            "today_high": 1605.0,
            "today_low": 1585.0,
            "yesterday_high": 1610.0,
            "yesterday_low": 1550.0,
        },
    ]

    candidate = all_stocks[1]  # LTP (1490) < VWAP (1505) -> should reject
    event = strat.evaluate(candidate, now, all_stocks=all_stocks)
    assert event is None
