from unittest.mock import patch

from app.candle_aggregator import get_intraday_15min_candles


def test_get_intraday_15min_candles_aggregation():
    # 6 five-minute candles (spanning 09:15 to 09:45, i.e., exactly two 15m candles)
    candles_5m = [
        # Bucket 1: 09:15 - 09:30 (minutes 0, 5, 10)
        {"open": 100.0, "high": 105.0, "low": 99.0, "close": 102.0, "volume": 1000.0, "minute": 0},
        {"open": 102.0, "high": 106.0, "low": 101.0, "close": 104.0, "volume": 1500.0, "minute": 5},
        {
            "open": 104.0,
            "high": 108.0,
            "low": 103.0,
            "close": 107.0,
            "volume": 2000.0,
            "minute": 10,
        },
        # Bucket 2: 09:30 - 09:45 (minutes 15, 20, 25)
        {
            "open": 107.0,
            "high": 107.5,
            "low": 102.0,
            "close": 103.0,
            "volume": 1200.0,
            "minute": 15,
        },
        {"open": 103.0, "high": 104.0, "low": 100.0, "close": 101.0, "volume": 800.0, "minute": 20},
        {"open": 101.0, "high": 102.0, "low": 98.0, "close": 99.0, "volume": 1100.0, "minute": 25},
    ]

    with patch("app.candle_aggregator.get_intraday_candles", return_value=candles_5m):
        candles_15m = get_intraday_15min_candles("TCS")
        assert len(candles_15m) == 2

        # Verify Bucket 1 (minute 0)
        b1 = candles_15m[0]
        assert b1["minute"] == 0
        assert b1["open"] == 100.0
        assert b1["high"] == 108.0  # max(105, 106, 108)
        assert b1["low"] == 99.0  # min(99, 101, 103)
        assert b1["close"] == 107.0  # close of last candle (minute 10)
        assert b1["volume"] == 4500.0  # 1000 + 1500 + 2000

        # Verify Bucket 2 (minute 15)
        b2 = candles_15m[1]
        assert b2["minute"] == 15
        assert b2["open"] == 107.0
        assert b2["high"] == 107.5
        assert b2["low"] == 98.0
        assert b2["close"] == 99.0
        assert b2["volume"] == 3100.0
