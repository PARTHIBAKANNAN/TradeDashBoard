from app.candle_query import get_cpr_regime, get_levels


def test_cpr_regime_calculation():
    # Previous day: High 1020, Low 1000, Close 1010
    stock = {
        "yesterday_high": 1020.0,
        "yesterday_low": 1000.0,
        "prev_close": 1010.0,
    }
    cpr = get_cpr_regime(stock)
    assert cpr["has_cpr"] is True
    # Pivot = (1020 + 1000 + 1010) / 3 = 1010.0
    assert cpr["pivot"] == 1010.0
    # BC = (1020 + 1000) / 2 = 1010.0
    assert cpr["bc"] == 1010.0
    # TC = (1010 - 1010) + 1010 = 1010.0
    assert cpr["tc"] == 1010.0
    # Width = 0.0 -> Narrow CPR!
    assert cpr["is_narrow"] is True
    assert cpr["is_wide"] is False


def test_cpr_wide_chop_detection():
    # Previous day high range: High 1100, Low 1000, Close 1020
    stock = {
        "yesterday_high": 1100.0,
        "yesterday_low": 1000.0,
        "prev_close": 1020.0,
    }
    cpr = get_cpr_regime(stock)
    assert cpr["has_cpr"] is True
    # Pivot = (1100 + 1000 + 1020) / 3 = 1040.0
    assert cpr["pivot"] == 1040.0
    # BC = (1100 + 1000) / 2 = 1050.0
    assert cpr["bc"] == 1050.0
    # TC = (1040 - 1050) + 1040 = 1030.0
    assert cpr["tc"] == 1030.0
    # Width = |1030 - 1050| / 1040 * 100 = 20 / 1040 * 100 = 1.92% (> 0.60%)
    assert cpr["cpr_width_pct"] > 0.60
    assert cpr["is_wide"] is True
    assert cpr["is_narrow"] is False


def test_get_levels_includes_cpr():
    stock = {
        "orb": {"C1": {"high": 1015.0, "low": 1005.0}},
        "yesterday_high": 1020.0,
        "yesterday_low": 1000.0,
        "prev_close": 1010.0,
    }
    levels = get_levels(stock)
    assert "pivot" in levels
    assert "cpr_bottom" in levels
    assert "cpr_top" in levels
    assert "cpr_width_pct" in levels
    assert levels["pivot"] == 1010.0
