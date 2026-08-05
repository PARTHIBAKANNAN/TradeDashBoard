"""
Standalone checks for the server-side momentum score — mirrors
frontend/src/utils/momentumScore.test.js's cases so the two ports stay
aligned. Run from backend/:

    python -m tests.test_momentum_score
"""

from app.momentum_score import (build_sector_means, compute_recommended,
                                momentum_score)


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


def test_scores_zero_when_no_signal():
    s = _stock(signal="None")
    assert momentum_score(s, [s], 0.5, build_sector_means([s])) == 0.0


def test_scores_zero_when_against_nifty_trend():
    s = _stock(signal="Bull • C1")
    # Nifty is down; a Bull signal is against-trend.
    assert momentum_score(s, [s], -0.5, build_sector_means([s])) == 0.0


def test_scores_above_zero_when_aligned_and_favorable():
    s = _stock(signal="Bull • C1")
    assert momentum_score(s, [s], 0.5, build_sector_means([s])) > 0.0


def test_rewards_stronger_rs_holding_others_equal():
    weak = _stock(relative_strength=0.5)
    strong = _stock(relative_strength=5)
    all_stocks = [weak, strong]
    means = build_sector_means(all_stocks)
    assert momentum_score(strong, all_stocks, 0.5, means) > momentum_score(
        weak, all_stocks, 0.5, means
    )


def test_rewards_favorable_vwap_side():
    above = _stock(ltp=105, vwap=100)  # Bull, price above VWAP
    below = _stock(ltp=95, vwap=100)  # Bull, price below VWAP
    all_stocks = [above, below]
    means = build_sector_means(all_stocks)
    assert momentum_score(above, all_stocks, 0.5, means) > momentum_score(
        below, all_stocks, 0.5, means
    )


def test_penalizes_extended_day_range():
    mid_range = _stock(day_range_pos=50)
    extended = _stock(day_range_pos=95)
    all_stocks = [mid_range, extended]
    means = build_sector_means(all_stocks)
    assert momentum_score(mid_range, all_stocks, 0.5, means) > momentum_score(
        extended, all_stocks, 0.5, means
    )


def test_rewards_fresher_signal():
    fresh = _stock(signal="Bull • C1")
    stale = _stock(signal="Bull • C4")
    all_stocks = [fresh, stale]
    means = build_sector_means(all_stocks)
    assert momentum_score(fresh, all_stocks, 0.5, means) > momentum_score(
        stale, all_stocks, 0.5, means
    )


def test_compute_recommended_picks_top_qualifying_stocks():
    strong = _stock(symbol="STRONG", relative_strength=5)
    weak = _stock(symbol="WEAK", relative_strength=0.1, day_range_pos=95)  # extended, penalized
    against_trend = _stock(symbol="AGAINST", signal="Bear • C1")
    picks = compute_recommended([strong, weak, against_trend], 0.5)
    symbols = [sym for sym, _score in picks]
    assert "STRONG" in symbols
    assert "AGAINST" not in symbols  # against-trend hard filter
    assert len(picks) <= 3


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
