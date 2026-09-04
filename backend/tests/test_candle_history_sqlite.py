import asyncio
import os
import tempfile
from datetime import date

import pytest
from app import candle_history
from app.state import MarketState


@pytest.fixture(autouse=True)
def temp_sqlite_db(monkeypatch):
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_candles.sqlite")
        monkeypatch.setattr(candle_history, "DB_PATH", db_path)
        yield db_path


def test_persist_and_get_candles():
    async def _test():
        d = date(2026, 9, 1)
        await candle_history.persist_candle(
            symbol="RELIANCE",
            bucket_date=d,
            bucket_minute=555,
            ohlc=[2900.0, 2910.0, 2895.0, 2905.0],
            delta=150.0,
            volume=50000.0,
        )
        await candle_history.persist_candle(
            symbol="RELIANCE",
            bucket_date=d,
            bucket_minute=560,
            ohlc=[2905.0, 2915.0, 2900.0, 2912.0],
            delta=200.0,
            volume=60000.0,
        )

        rows = await candle_history.get_candles("RELIANCE", d)
        assert len(rows) == 2
        assert rows[0]["bucket_minute"] == 555
        assert rows[0]["open"] == 2900.0
        assert rows[0]["high"] == 2910.0
        assert rows[0]["delta"] == 150.0
        assert rows[1]["close"] == 2912.0

    asyncio.run(_test())


def test_get_all_today_candles_and_range():
    async def _test():
        d1 = date(2026, 8, 31)
        d2 = date(2026, 9, 1)

        await candle_history.persist_candle(
            "TCS", d1, 555, [4000.0, 4010.0, 3990.0, 4005.0], 50.0, 10000.0
        )
        await candle_history.persist_candle(
            "INFY", d2, 555, [1800.0, 1810.0, 1790.0, 1805.0], -30.0, 20000.0
        )
        await candle_history.persist_candle(
            "TCS", d2, 555, [4020.0, 4030.0, 4015.0, 4025.0], 80.0, 15000.0
        )

        all_d2 = await candle_history.get_all_today_candles(d2)
        assert "INFY" in all_d2
        assert "TCS" in all_d2
        assert len(all_d2["TCS"]) == 1

        tcs_range = await candle_history.get_candles_range("TCS", d1, d2)
        assert len(tcs_range) == 2
        assert tcs_range[0]["bucket_date"] == str(d1)
        assert tcs_range[1]["bucket_date"] == str(d2)

        latest_date = await candle_history.get_latest_candle_date("TCS")
        assert latest_date == str(d2)

    asyncio.run(_test())


def test_delete_candles_older_than():
    async def _test():
        d1 = date(2026, 8, 1)
        d2 = date(2026, 9, 1)
        await candle_history.persist_candle("RELIANCE", d1, 555, [2800.0, 2810.0, 2790.0, 2805.0])
        await candle_history.persist_candle("RELIANCE", d2, 555, [2900.0, 2910.0, 2890.0, 2905.0])

        deleted = await candle_history.delete_candles_older_than(date(2026, 8, 15))
        assert deleted == 1

        remaining = await candle_history.get_candles("RELIANCE", d1)
        assert len(remaining) == 0

        kept = await candle_history.get_candles("RELIANCE", d2)
        assert len(kept) == 1

    asyncio.run(_test())


def test_startup_snapshot_and_seed_missing_state():
    async def _test():
        from app.config import IST
        from datetime import datetime, timedelta
        d0 = datetime.now(IST).date()
        d1 = d0 - timedelta(days=1)
        await candle_history.persist_candle("RELIANCE", d1, 555, [2800.0, 2820.0, 2780.0, 2810.0])
        await candle_history.persist_candle("RELIANCE", d1, 560, [2810.0, 2830.0, 2800.0, 2825.0])
        await candle_history.persist_candle("RELIANCE", d0, 555, [2900.0, 2920.0, 2890.0, 2910.0])


        snapshot = await candle_history.get_startup_snapshot()
        assert "RELIANCE" in snapshot
        assert snapshot["RELIANCE"]["d0_high"] == 2920.0
        assert snapshot["RELIANCE"]["d0_low"] == 2890.0
        assert snapshot["RELIANCE"]["d0_close"] == 2910.0
        assert snapshot["RELIANCE"]["d1_high"] == 2830.0
        assert snapshot["RELIANCE"]["d1_low"] == 2780.0
        assert snapshot["RELIANCE"]["d1_close"] == 2825.0

        state = MarketState()
        state.stocks["RELIANCE"] = {
            "symbol": "RELIANCE",
            "ltp": None,
            "prev_close": None,
            "yesterday_high": None,
            "yesterday_low": None,
            "pct_change": 0.0,
        }

        await candle_history.seed_missing_state(state)
        assert state.stocks["RELIANCE"]["yesterday_high"] == 2830.0
        assert state.stocks["RELIANCE"]["yesterday_low"] == 2780.0

    asyncio.run(_test())
