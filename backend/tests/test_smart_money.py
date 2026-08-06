from app.smart_money import WEIGHTS, _percentile_rank, _today_return


def test_percentile_rank_of_max_value_is_100():
    values = [10, 20, 30, 40]
    assert _percentile_rank(40, values) == 100.0


def test_percentile_rank_of_min_value_is_lowest():
    values = [10, 20, 30, 40]
    assert _percentile_rank(10, values) == 25.0


def test_percentile_rank_empty_values_is_zero():
    assert _percentile_rank(5, []) == 0.0


def test_percentile_rank_ties_count_as_below_or_equal():
    values = [10, 10, 10]
    assert _percentile_rank(10, values) == 100.0


def test_today_return_positive_when_close_above_open():
    rows = [{"open": 100.0, "close": 100.0}, {"open": 100.0, "close": 110.0}]
    assert _today_return(rows) == 10.0


def test_today_return_none_when_open_is_zero():
    rows = [{"open": 0.0, "close": 5.0}]
    assert _today_return(rows) is None


def test_weights_sum_to_one():
    assert round(sum(WEIGHTS.values()), 4) == 1.0
