from datetime import datetime
from zoneinfo import ZoneInfo

from app.trade_management import check_vwap_elasticity_and_exhaustion

IST = ZoneInfo("Asia/Kolkata")


def test_vwap_elasticity_early_morning_allowed():
    # 09:25 AM (before 09:35 AM) -> Allowed
    time_0925 = datetime(2026, 10, 30, 9, 25, tzinfo=IST)
    stock = {"vwap": 1000.0, "low": 980.0, "high": 1010.0}
    ok, reason = check_vwap_elasticity_and_exhaustion(stock, "SELL", 980.0, now_ist=time_0925)
    assert ok is True
    assert "early" in reason.lower()


def test_vwap_elasticity_rejects_bottom_wick_exhaustion():
    # 09:48 AM (after 09:35 AM), VWAP 1018.0, Day low 1007.0, Entry 1008.0 (like HAVELLS)
    # Stretch = |1008 - 1018| / 1018 = 0.98% (> 0.75%), Entry 1008 <= 1007 * 1.0015 = 1008.51
    time_0948 = datetime(2026, 10, 30, 9, 48, tzinfo=IST)
    stock = {"vwap": 1018.0, "low": 1007.0, "high": 1020.0}
    ok, reason = check_vwap_elasticity_and_exhaustion(stock, "SELL", 1008.0, now_ist=time_0948)
    assert ok is False
    assert "exhaustion wick guard" in reason.lower()


def test_vwap_elasticity_allows_pullback_entry():
    # 09:48 AM, VWAP 1018.0, Day low 1007.0, but entry on pullback at 1014.0
    # Stretch = |1014 - 1018| / 1018 = 0.39% (< 0.75%)
    time_0948 = datetime(2026, 10, 30, 9, 48, tzinfo=IST)
    stock = {"vwap": 1018.0, "low": 1007.0, "high": 1020.0}
    ok, reason = check_vwap_elasticity_and_exhaustion(stock, "SELL", 1014.0, now_ist=time_0948)
    assert ok is True
    assert "clear" in reason.lower()
