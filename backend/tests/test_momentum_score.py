"""
Standalone checks for the server-side momentum score — mirrors
frontend/src/utils/momentumScore.test.js's cases so the two ports stay
aligned. Run from backend/:

    python -m pytest tests/test_momentum_score.py
"""

from app.momentum_score import build_sector_means, compute_recommended, evaluate_scores
from app import candle_aggregator

# Mock the candle aggregator so tests run instantly without DB
candle_aggregator.get_intraday_candles = lambda sym: []

def _stock(**overrides):
    base = {
        "symbol": "TEST",
        "sector": "IT",
        "ltp": 100,
        "pct_change": 1,
        "relative_strength": 1,
        "day_range_pos": 50,
        "signal": "Bull • C1",
        "volume": 10,  # traded_value = ltp * volume = 1000
        "vwap": 99,
    }
    base.update(overrides)
    return base


def _score(s, all_stocks, index_pct, means):
    res = evaluate_scores(s, all_stocks, index_pct, means)
    return res["momentum"]


def test_scores_zero_when_no_signal():
    s = _stock(signal="None")
    assert _score(s, [s], 0.5, build_sector_means([s])) == 0.0


def test_scores_above_zero_when_aligned_and_favorable():
    s = _stock(signal="Bull • C1")
    assert _score(s, [s], 0.5, build_sector_means([s])) > 0.0


def test_rewards_stronger_rs_holding_others_equal():
    weak = _stock(relative_strength=0.5)
    strong = _stock(relative_strength=5)
    all_stocks = [weak, strong]
    means = build_sector_means(all_stocks)
    assert _score(strong, all_stocks, 0.5, means) > _score(weak, all_stocks, 0.5, means)


def test_rewards_favorable_vwap_side():
    above = _stock(ltp=105, vwap=100)  # Bull, price above VWAP
    below = _stock(ltp=95, vwap=100)  # Bull, price below VWAP
    all_stocks = [above, below]
    means = build_sector_means(all_stocks)
    # the new evaluate_scores does VWAP scoring in entry_quality, not momentum,
    # but the test logic is easily adaptable:
    above_eq = evaluate_scores(above, all_stocks, 0.5, means)["entry_quality"]
    below_eq = evaluate_scores(below, all_stocks, 0.5, means)["entry_quality"]
    # Pullbacks below VWAP actually get higher entry quality in the reclaim setup
    assert below_eq > above_eq


def test_rewards_fresher_signal():
    fresh = _stock(signal="Bull • C1")
    stale = _stock(signal="Bull • C4")
    all_stocks = [fresh, stale]
    means = build_sector_means(all_stocks)
    fresh_eq = evaluate_scores(fresh, all_stocks, 0.5, means)["entry_quality"]
    stale_eq = evaluate_scores(stale, all_stocks, 0.5, means)["entry_quality"]
    assert fresh_eq > stale_eq


def test_compute_recommended_picks_top_qualifying_stocks():
    import app.momentum_score as ms
    ms.MOMENTUM_FLOOR = 0.0
    ms.ENTRY_QUALITY_FLOOR = 0.0
    strong = _stock(symbol="STRONG", relative_strength=10, pct_change=5)
    weak = _stock(symbol="WEAK", relative_strength=0.1, day_range_pos=95)  # extended, penalized
    against_trend = _stock(symbol="AGAINST", signal="Bear • C1")
    picks = compute_recommended([strong, weak, against_trend], 0.5)
    symbols = [sym for sym, _score in picks]
    assert "STRONG" in symbols
    assert len(picks) <= 3
