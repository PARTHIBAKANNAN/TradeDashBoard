from datetime import date
from app.risk_allocator import RiskAllocator
from app.strategy_base import StrategyFamily


def test_risk_allocator_budget_and_consume():
    today = date(2026, 9, 14)
    alloc = RiskAllocator(
        total_risk_inr=2000.0,
        orb_trades=1,
        orb_risk=800.0,
        vwap_trades=1,
        vwap_risk=600.0,
        sector_trades=1,
        sector_risk=600.0,
        squeeze_trades=0,
        squeeze_risk=0.0,
    )

    # Initial check
    assert alloc.can_trade(StrategyFamily.ORB_BREAKOUT, today) is True
    assert alloc.can_trade(StrategyFamily.VWAP_RETEST, today) is True
    assert alloc.can_trade(StrategyFamily.SQUEEZE, today) is False

    # Consume ORB trade
    ok = alloc.consume(StrategyFamily.ORB_BREAKOUT, 500.0, today)
    assert ok is True
    # Max trades is 1, so no more ORB trades
    assert alloc.can_trade(StrategyFamily.ORB_BREAKOUT, today) is False

    # VWAP trade is still available
    assert alloc.can_trade(StrategyFamily.VWAP_RETEST, today) is True

    # Consuming excessive risk should fail
    fail_risk = alloc.consume(StrategyFamily.VWAP_RETEST, 700.0, today)
    assert fail_risk is False

    # Consuming valid risk succeeds
    ok_vwap = alloc.consume(StrategyFamily.VWAP_RETEST, 400.0, today)
    assert ok_vwap is True
    assert alloc.can_trade(StrategyFamily.VWAP_RETEST, today) is False

    summary = alloc.summary(today)
    assert summary["ORB_BREAKOUT"]["trades"] == "1/1"
    assert summary["ORB_BREAKOUT"]["risk"] == "₹500/₹800"


def test_risk_allocator_resets_on_new_day():
    day1 = date(2026, 9, 14)
    day2 = date(2026, 9, 15)
    alloc = RiskAllocator()

    alloc.consume(StrategyFamily.ORB_BREAKOUT, 1000.0, day1)
    assert alloc.can_trade(StrategyFamily.ORB_BREAKOUT, day1) is False

    # New day resets
    assert alloc.can_trade(StrategyFamily.ORB_BREAKOUT, day2) is True


def test_risk_allocator_alerts():
    today = date(2026, 9, 14)
    alloc = RiskAllocator(alerts_per_strategy=1)

    assert alloc.can_alert(StrategyFamily.ORB_BREAKOUT, today) is True
    ok = alloc.consume_alert(StrategyFamily.ORB_BREAKOUT, today)
    assert ok is True
    assert alloc.can_alert(StrategyFamily.ORB_BREAKOUT, today) is False

    # Other strategies still have their alert slot
    assert alloc.can_alert(StrategyFamily.VWAP_RETEST, today) is True
    assert alloc.can_alert(StrategyFamily.SECTOR_SYMPATHY, today) is True
    assert alloc.can_alert(StrategyFamily.SQUEEZE, today) is True

