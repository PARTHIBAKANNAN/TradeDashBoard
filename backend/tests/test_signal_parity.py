from datetime import datetime

from app.calculations import (day_range_position, evaluate_orb,
                              first_candle_extreme_intact,
                              get_default_strategy_registry,
                              has_two_sided_range, intraday_relative_strength,
                              pct_change, range_map)
from app.config import IST
from app.strategy_base import Direction, StrategyFamily


def test_calculations_parity_and_registry():
    registry = get_default_strategy_registry()
    strategies = registry.get_strategies()
    assert len(strategies) == 4
    assert any(s.family == StrategyFamily.ORB_BREAKOUT for s in strategies)
    assert any(s.family == StrategyFamily.VWAP_RETEST for s in strategies)
    assert any(s.family == StrategyFamily.SECTOR_SYMPATHY for s in strategies)
    assert any(s.family == StrategyFamily.SQUEEZE for s in strategies)

    # Check math exports intact
    assert round(pct_change(3690.0, 3630.0), 2) == 1.65
    assert round(intraday_relative_strength(1.65, -0.33), 2) == 1.98
    assert day_range_position(3650, 3600, 3700) == 50.0

    # Check evaluate_orb export intact
    now = datetime(2026, 7, 8, 10, 0, tzinfo=IST)
    orb = {"C1": {"high": 3650.0, "low": 3610.0}}
    sig, t = evaluate_orb(orb, 3660.0, now, "None")
    assert sig == "Bull • C1" and t == "10:00"

    # Check registry evaluation for the same stock
    stock = {
        "symbol": "NSE:TEST-EQ",
        "ltp": 3660.0,
        "signal": "None",
        "orb": orb,
        "two_sided_ok": True,
        "candle1_high": 3640.0,
        "candle1_low": 3620.0,
        "today_high": 3660.0,
        "today_low": 3620.0,
        "relative_strength": 0.5,
    }
    event = registry.evaluate_all(stock, now)
    assert event is not None
    assert event.label == "Bull • C1"
    assert event.direction == Direction.BULL
    assert event.trigger_price == 3650.0
