"""
Unit tests for PulseHunter V2 Dual-Score Engine (rank_universe_momentum & calculate_entry_quality).
"""

from datetime import datetime, timedelta
from app.config import IST
from app.technical_indicators import (
    rank_universe_momentum,
    calculate_entry_quality,
    compute_conviction_score,
    validate_quant_filters,
)


def test_momentum_score_strong_candidate():
    all_stocks = [
        {"symbol": "NSE:TATASTEEL-EQ", "ltp": 155.0, "vwap": 154.2, "relative_strength": 1.15, "depth_delta": 300},
        {"symbol": "NSE:INFY-EQ", "ltp": 1600.0, "vwap": 1598.0, "relative_strength": 0.20, "depth_delta": -50},
    ]
    closes = [150.0 + i * 0.3 for i in range(25)]
    vols = [10000.0, 12000.0, 11000.0, 26000.0]

    score, factors, metrics = rank_universe_momentum(
        stock=all_stocks[0],
        signal="Bull • C0.5",
        all_stocks=all_stocks,
        candle_closes=closes,
        candle_volumes=vols,
        depth_delta=300,
    )

    assert score >= 60, f"Expected strong candidate score >= 60, got {score}"
    assert metrics["momentum_score"] == score
    assert metrics["vol_ratio"] >= 2.0


def test_entry_quality_fresh_vs_chase():
    stock = {"symbol": "NSE:RELIANCE-EQ", "ltp": 2855.0, "vwap": 2845.0}
    now = datetime.now(IST)

    # 1. Fresh breakout near trigger level (0.18% above breakout level 2850)
    fresh_score, fresh_factors, fresh_metrics = calculate_entry_quality(
        stock=stock,
        signal="Bull • C0.5",
        trigger_level=2850.0,
        trigger_time=now - timedelta(minutes=3),
        day_high=2856.0,
        day_low=2835.0,
        atr_14=30.0,
        now=now,
    )
    assert fresh_score >= 80, f"Expected fresh score >= 80, got {fresh_score}"

    # 2. Late chase (2.8% above breakout level 2780, 45 minutes elapsed, ATR exhausted)
    stale_score, stale_factors, stale_metrics = calculate_entry_quality(
        stock=stock,
        signal="Bull • C0.5",
        trigger_level=2780.0,
        trigger_time=now - timedelta(minutes=45),
        day_high=2860.0,
        day_low=2800.0,
        atr_14=30.0,
        now=now,
    )
    assert stale_score < 60, f"Expected stale chase score < 60, got {stale_score}"


def test_hard_vwap_veto():
    # Long setup when LTP is below VWAP
    stock_bad_long = {"symbol": "NSE:TCS-EQ", "ltp": 3400.0, "vwap": 3420.0}
    score, factors, _ = calculate_entry_quality(
        stock=stock_bad_long,
        signal="Bull • C0.5",
        trigger_level=3410.0,
    )
    assert score == -1, f"Expected hard veto (-1) for Long below VWAP, got {score}"
    assert "below VWAP" in factors[0]["detail"]


def test_combined_conviction_and_legacy_shim():
    all_stocks = [
        {"symbol": "NSE:TATASTEEL-EQ", "ltp": 155.0, "vwap": 154.2, "relative_strength": 1.15, "depth_delta": 300},
    ]
    closes = [150.0 + i * 0.3 for i in range(25)]

    passes, reason, metrics = validate_quant_filters(
        stock=all_stocks[0],
        signal="Bull • C0.5",
        all_stocks=all_stocks,
        candle_closes=closes,
    )
    assert passes is True
    assert "Momentum" in reason
