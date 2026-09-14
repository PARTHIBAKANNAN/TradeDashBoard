from datetime import datetime
from unittest.mock import patch
from app.config import IST
from app.strategies.squeeze_strategy import SqueezeStrategy
from app.strategy_base import Direction, StrategyFamily
from app.technical_indicators import (
    compute_bollinger_bands,
    compute_keltner_channels,
    detect_volatility_squeeze,
)


def test_bollinger_bands_and_keltner_channels():
    # 20 flat prices at 100.0 -> std dev is 0, bands equal price
    flat_prices = [100.0] * 20
    u_bb, m_bb, l_bb = compute_bollinger_bands(flat_prices, period=20, num_std=2.0)
    assert u_bb == 100.0
    assert m_bb == 100.0
    assert l_bb == 100.0

    # Moving prices with volatility
    prices = [100.0 + i for i in range(20)]
    u_bb, m_bb, l_bb = compute_bollinger_bands(prices, period=20, num_std=2.0)
    assert u_bb > m_bb > l_bb

    candles = [
        {"open": 100.0, "high": 102.0, "low": 98.0, "close": 100.0 + (i % 2), "minute": i * 5}
        for i in range(20)
    ]
    u_kc, m_kc, l_kc = compute_keltner_channels(candles, period=20, atr_multiplier=1.5)
    assert u_kc > m_kc > l_kc


def test_detect_volatility_squeeze_simulation():
    # Construct 25 candles where first 23 are tight range (Squeeze ON) and 24-25 expand (Squeeze FIRED)
    tight_candles = [
        {"open": 100.0, "high": 100.5, "low": 99.5, "close": 100.0, "minute": i * 5}
        for i in range(23)
    ]
    # In tight candles, BB width is small (std dev low), KC width is wider -> Squeeze ON
    is_sq, is_fired, metrics = detect_volatility_squeeze(tight_candles, min_squeeze_bars=3)
    assert is_sq is True
    assert is_fired is False

    # Now add expansion candles where close jumps to 108.0
    expansion_candles = list(tight_candles) + [
        {"open": 100.0, "high": 106.0, "low": 99.5, "close": 105.0, "minute": 23 * 5},
        {"open": 105.0, "high": 110.0, "low": 104.0, "close": 109.0, "minute": 24 * 5},
    ]
    is_sq_after, is_fired_after, metrics_after = detect_volatility_squeeze(expansion_candles, min_squeeze_bars=3)
    assert is_sq_after is False
    assert is_fired_after is True
    assert metrics_after["is_squeeze_fired"] is True


def test_squeeze_strategy_evaluation():
    strat = SqueezeStrategy()
    assert strat.family == StrategyFamily.SQUEEZE
    assert strat.name == "SQUEEZE_EXPANSION"

    now = datetime(2026, 9, 14, 11, 30, tzinfo=IST)
    stock = {
        "symbol": "NSE:BAJFINANCE-EQ",
        "ltp": 7100.0,
        "vwap": 7050.0,
        "relative_strength": 1.2,
        "signal": None,
    }

    tight_candles = [
        {"open": 7000.0, "high": 7010.0, "low": 6990.0, "close": 7000.0, "minute": i * 5}
        for i in range(23)
    ]
    expansion_candles = tight_candles + [
        {"open": 7000.0, "high": 7060.0, "low": 6995.0, "close": 7050.0, "minute": 23 * 5},
        {"open": 7050.0, "high": 7110.0, "low": 7040.0, "close": 7100.0, "minute": 24 * 5},
    ]

    with patch("app.candle_aggregator.get_intraday_candles", return_value=expansion_candles):
        event = strat.evaluate(stock, now)
        assert event is not None
        assert event.label == "Bull • Squeeze Expansion"
        assert event.direction == Direction.BULL
        assert event.strategy_family == StrategyFamily.SQUEEZE
        assert event.symbol == "NSE:BAJFINANCE-EQ"
