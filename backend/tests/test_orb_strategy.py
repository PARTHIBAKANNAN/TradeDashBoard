from datetime import datetime
from app.config import IST
from app.strategies.orb_strategy import (
    OrbStrategy,
    completed_candles,
    first_candle_extreme_intact,
    has_two_sided_range,
)
from app.strategy_base import Direction, StrategyFamily


def test_completed_candles():
    t_920 = datetime(2026, 9, 14, 9, 20, tzinfo=IST).time()
    assert completed_candles(t_920) == []

    t_935 = datetime(2026, 9, 14, 9, 35, tzinfo=IST).time()
    assert completed_candles(t_935) == ["C0.5"]

    t_950 = datetime(2026, 9, 14, 9, 50, tzinfo=IST).time()
    assert completed_candles(t_950) == ["C0.5", "C1"]


def test_orb_strategy_c1_bull_breakout():
    strat = OrbStrategy()
    assert strat.family == StrategyFamily.ORB_BREAKOUT
    assert strat.name == "ORB_BREAKOUT"

    now = datetime(2026, 9, 14, 10, 0, tzinfo=IST)
    stock = {
        "symbol": "NSE:RELIANCE-EQ",
        "ltp": 2550.0,
        "signal": None,
        "orb": {
            "C1": {"high": 2500.0, "low": 2450.0},
        },
        "two_sided_ok": True,
        "candle1_high": 2490.0,
        "candle1_low": 2460.0,
        "today_high": 2550.0,
        "today_low": 2460.0,
        "relative_strength": 0.5,
    }

    event = strat.evaluate(stock, now)
    assert event is not None
    assert event.label == "Bull • C1"
    assert event.direction == Direction.BULL
    assert event.trigger_price == 2500.0
    assert event.strategy_name == "C1"


def test_orb_strategy_c1_dedup_from_c05():
    strat = OrbStrategy()
    now = datetime(2026, 9, 14, 10, 0, tzinfo=IST)
    stock = {
        "symbol": "NSE:RELIANCE-EQ",
        "ltp": 2550.0,
        "signal": "Bull • C0.5",
        "orb": {
            "C1": {"high": 2500.0, "low": 2450.0},
        },
        "two_sided_ok": True,
        "candle1_high": 2490.0,
        "candle1_low": 2460.0,
        "today_high": 2550.0,
        "today_low": 2460.0,
        "relative_strength": 0.5,
    }

    # Should deduplicate and not re-trigger C1 on the same Bull move
    event = strat.evaluate(stock, now)
    assert event is None


def test_orb_strategy_c1_failed_quality_gate():
    strat = OrbStrategy()
    now = datetime(2026, 9, 14, 10, 0, tzinfo=IST)
    stock = {
        "symbol": "NSE:RELIANCE-EQ",
        "ltp": 2550.0,
        "signal": None,
        "orb": {
            "C1": {"high": 2500.0, "low": 2450.0},
        },
        "two_sided_ok": False,
        "candle1_high": 2490.0,
        "candle1_low": 2460.0,
        "today_high": 2550.0,
        "today_low": 2440.0,  # Broke candle1 low -> extreme not intact
        "relative_strength": 0.2,
    }

    event = strat.evaluate(stock, now)
    assert event is None
