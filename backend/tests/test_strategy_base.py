from datetime import datetime, time as dt_time
from app.config import IST
from app.strategy_base import (
    Direction,
    SignalEvent,
    StrategyFamily,
    StrategyRegistry,
)


class DummyStrategy:
    def __init__(self, name: str, family: StrategyFamily, start: int, end: int, fire: bool = False):
        self._name = name
        self._family = family
        self._start = dt_time(start, 0)
        self._end = dt_time(end, 0)
        self._fire = fire

    @property
    def name(self) -> str:
        return self._name

    @property
    def family(self) -> StrategyFamily:
        return self._family

    @property
    def active_window(self) -> tuple[dt_time, dt_time]:
        return (self._start, self._end)

    def evaluate(self, stock: dict, now: datetime, *, all_stocks: list[dict] | None = None) -> SignalEvent | None:
        if self._fire:
            return SignalEvent(
                strategy_family=self._family,
                strategy_name=self._name,
                direction=Direction.BULL,
                symbol=stock.get("symbol", ""),
                trigger_price=stock.get("ltp", 100.0),
                signal_time=now,
                metadata={"test": True},
            )
        return None


def test_signal_event_label_and_properties():
    now = datetime(2026, 9, 14, 9, 30, tzinfo=IST)
    sig_orb = SignalEvent(
        strategy_family=StrategyFamily.ORB_BREAKOUT,
        strategy_name="C1",
        direction=Direction.BULL,
        symbol="NSE:TCS-EQ",
        trigger_price=3500.0,
        signal_time=now,
    )
    assert sig_orb.label == "Bull • C1"
    assert sig_orb.is_bull is True

    sig_vwap = SignalEvent(
        strategy_family=StrategyFamily.VWAP_RETEST,
        strategy_name="VWAP_RETEST",
        direction=Direction.BEAR,
        symbol="NSE:INFY-EQ",
        trigger_price=1500.0,
        signal_time=now,
    )
    assert sig_vwap.label == "Bear • VWAP Retest"
    assert sig_vwap.is_bull is False


def test_strategy_registry_window_filtering():
    registry = StrategyRegistry()
    s1 = DummyStrategy("S1", StrategyFamily.ORB_BREAKOUT, 9, 10, fire=True)
    s2 = DummyStrategy("S2", StrategyFamily.VWAP_RETEST, 10, 11, fire=True)
    registry.register(s1)
    registry.register(s2)

    stock = {"symbol": "NSE:RELIANCE-EQ", "ltp": 2500.0}

    # At 09:30, only S1 is active
    now_930 = datetime(2026, 9, 14, 9, 30, tzinfo=IST)
    event = registry.evaluate_all(stock, now_930)
    assert event is not None
    assert event.strategy_name == "S1"

    # At 10:30, only S2 is active
    now_1030 = datetime(2026, 9, 14, 10, 30, tzinfo=IST)
    event2 = registry.evaluate_all(stock, now_1030)
    assert event2 is not None
    assert event2.strategy_name == "S2"

    # At 11:30, neither is active
    now_1130 = datetime(2026, 9, 14, 11, 30, tzinfo=IST)
    event3 = registry.evaluate_all(stock, now_1130)
    assert event3 is None


def test_strategy_registry_priority_order():
    registry = StrategyRegistry()
    # Both active at 09:30, but S1 registered first
    s1 = DummyStrategy("S1", StrategyFamily.ORB_BREAKOUT, 9, 11, fire=True)
    s2 = DummyStrategy("S2", StrategyFamily.VWAP_RETEST, 9, 11, fire=True)
    registry.register(s1)
    registry.register(s2)

    stock = {"symbol": "NSE:RELIANCE-EQ", "ltp": 2500.0}
    now_930 = datetime(2026, 9, 14, 9, 30, tzinfo=IST)
    event = registry.evaluate_all(stock, now_930)
    assert event is not None
    assert event.strategy_name == "S1"
