"""
Unit tests for app.ai_copilot — tests context compilation, pre-market cache, and heuristic fallbacks.

Run from backend/:  python -m pytest tests/test_ai_copilot.py -v
"""

from unittest.mock import patch, MagicMock
import pytest

from app import ai_copilot


def test_get_premarket_briefing_returns_dict():
    briefing = ai_copilot.get_premarket_briefing()
    assert isinstance(briefing, dict)
    assert "bias" in briefing
    assert "summary" in briefing


def test_run_premarket_briefing_fallback_without_api_key():
    with patch("app.ai_copilot._get_api_key", return_value=""):
        briefing = ai_copilot.run_premarket_briefing()
        assert briefing["bias"] == "NEUTRAL"
        assert "Default" in briefing["summary"]


def test_compile_symbol_context_structure():
    with patch("app.state.market_state") as mock_ms:
        mock_ms.lock.return_value.__enter__ = lambda s: s
        mock_ms.lock.return_value.__exit__ = MagicMock(return_value=False)
        mock_ms.get_stock.return_value = {
            "symbol": "RELIANCE",
            "ltp": 2500.0,
            "pct_change": 1.2,
            "signal": "Bull • C1",
        }
        mock_ms.nifty = {"ltp": 24000.0, "pct_change": 0.5}

        ctx = ai_copilot.compile_symbol_context("RELIANCE")
        assert ctx["symbol"] == "RELIANCE"
        assert ctx["stock_snapshot"]["ltp"] == 2500.0
        assert "nifty_context" in ctx
        assert "time_window_assessment" in ctx


def test_analyze_trade_setup_heuristic_fallback():
    with patch("app.ai_copilot._get_api_key", return_value=""):
        with patch("app.ai_copilot.compile_symbol_context") as mock_compile:
            mock_compile.return_value = {
                "stock_snapshot": {
                    "ltp": 1000.0,
                    "pct_change": 1.5,
                    "signal": "Bull • C1",
                }
            }
            res = ai_copilot.analyze_trade_setup("RELIANCE")
            assert res["symbol"] == "RELIANCE"
            assert res["decision"] == "CONFIRM_BUY"
            assert res["suggested_entry"] == 1000.0
            assert res["suggested_sl"] < 1000.0
            assert res["suggested_target"] > 1000.0
            assert res.get("is_fallback") is True


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
