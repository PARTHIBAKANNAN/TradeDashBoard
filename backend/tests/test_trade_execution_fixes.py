import pytest
from app import candle_aggregator, config, trade_management
from app.state import market_state


def test_symbol_normalization_in_candle_aggregator():
    """Verify that get_intraday_candles resolves both short symbol and broker full symbol."""
    full_sym = "NSE:COFORGE-EQ"
    short_sym = "COFORGE"

    # Seed candle_aggregator with full symbol
    candle_aggregator._completed_day_candles.clear()
    candle_aggregator._day_candles.clear()
    candle_aggregator._completed_day_candles[full_sym] = [
        (None, 570, [1900.0, 1940.0, 1895.0, 1935.0], 100.0, 50000.0)
    ]

    # Both lookups should return the same candle list
    candles_full = candle_aggregator.get_intraday_candles(full_sym)
    candles_short = candle_aggregator.get_intraday_candles(short_sym)

    assert len(candles_full) == 1
    assert len(candles_short) == 1
    assert candles_short[0]["close"] == 1935.0


def test_clamped_stops_minimum_floor_on_expensive_stock():
    """Verify that SOLARINDS (₹20,000) stop distance is clamped to at least 0.85% (₹170), not 9 pts."""
    entry = 19934.0
    stops_sell = trade_management.calculate_initial_stops("SOLARINDS", "SELL", entry)

    # 0.85% of 19,934 = 169.44 pts
    min_expected_sl = entry + (entry * 0.0085)
    assert stops_sell["sl_price"] >= round(min_expected_sl, 2)
    assert stops_sell["sl_distance"] >= round(entry * 0.0085, 2)
    # Target should be at least 1:2.0R (>= 338 pts move)
    assert stops_sell["target_price"] <= entry - (2.0 * stops_sell["sl_distance"])


def test_clamped_stops_on_coforge():
    """Verify that COFORGE (₹1,936.3) stop distance is clamped to at least 0.85% (₹16.45), not 0.8 pts."""
    entry = 1936.3
    stops_buy = trade_management.calculate_initial_stops("COFORGE", "BUY", entry)

    min_expected_dist = entry * 0.0085
    assert stops_buy["sl_distance"] >= round(min_expected_dist, 2)
    assert stops_buy["sl_price"] <= round(entry - min_expected_dist, 2)
    assert stops_buy["target_price"] >= round(entry + (2.0 * stops_buy["sl_distance"]), 2)


def test_support_resistance_proximity_guard():
    """Verify that check_support_resistance_proximity flags entries too close to prior-day extremes."""
    # Stock with prior-day low at 19,925
    stock = {
        "symbol": "SOLARINDS",
        "yesterday_low": 19925.0,
        "yesterday_high": 20367.0,
    }

    # SELL at 19,934 is only 9 pts (0.045%) above yesterday_low -> Bear trap
    is_safe, reason = trade_management.check_support_resistance_proximity(stock, "SELL", 19934.0)
    assert is_safe is False
    assert "support" in reason.lower()

    # SELL at 20,100 is far from yesterday_low -> Safe
    is_safe_far, _ = trade_management.check_support_resistance_proximity(stock, "SELL", 20100.0)
    assert is_safe_far is True

    # BUY at 20,360 is only 7 pts (0.034%) below yesterday_high -> Bull trap
    is_safe_buy, reason_buy = trade_management.check_support_resistance_proximity(
        stock, "BUY", 20360.0
    )
    assert is_safe_buy is False
    assert "resistance" in reason_buy.lower()
