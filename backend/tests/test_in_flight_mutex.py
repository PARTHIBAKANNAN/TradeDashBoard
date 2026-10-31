import time
from datetime import datetime
from unittest.mock import patch

import pytest
from app import ai_copilot, config
from app.config import IST
from app.state import market_state


def test_in_flight_mutex_blocks_concurrent_orders(monkeypatch):
    """
    Simulates Strategy A and Strategy B attempting to execute on the same symbol concurrently.
    Strategy A claims the mutex first. Strategy B must be rejected immediately.
    """
    sym = "TEST_MUTEX"
    today = datetime.now(IST).date()
    ai_copilot._reset_daily_counters_if_needed(today, force=True)

    monkeypatch.setattr(config, "AUTO_PAPER_USER_ID", "test-user-123")
    monkeypatch.setattr(market_state, "get_stock", lambda s: {"ltp": 100.0, "vwap": 100.0})

    test_time = datetime(today.year, today.month, today.day, 9, 35, 0, tzinfo=IST)

    with patch("app.ai_copilot.datetime") as mock_dt:
        mock_dt.now.return_value = test_time

        # Manually acquire reservation as Strategy A
        now_ts = time.time()
        with ai_copilot._notified_lock:
            ai_copilot._in_flight_evaluations[sym] = now_ts

        # Now Strategy B tries to execute on the same sym
        ok, reason = ai_copilot.execute_auto_trade(
            sym=sym,
            signal="Bull • C0.5",
            side="BUY",
            score=75.0,
        )

        # Strategy B must be blocked because symbol is in-flight
        assert not ok
        assert "in-flight" in reason.lower()

        # Once Strategy A finishes, reservation is removed
        with ai_copilot._notified_lock:
            ai_copilot._in_flight_evaluations.pop(sym, None)

        assert sym not in ai_copilot._in_flight_evaluations
