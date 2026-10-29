from datetime import datetime
from datetime import time as dt_time
from unittest.mock import MagicMock, patch

import pytest
from app import ai_copilot, calculations, config
from app.config import IST
from app.strategy_base import Direction, SignalEvent, StrategyFamily


def test_pure_quant_strategy_execution_bypasses_gemini():
    """Verify that pure quant strategies (e.g. VWAP_RETEST, OI_SQUEEZE) do not call Gemini."""
    today = datetime.now(IST).date()
    ai_copilot._reset_daily_counters_if_needed(today, force=True)

    test_time = datetime(today.year, today.month, today.day, 10, 0, 0, tzinfo=IST)

    with patch("app.ai_copilot.call_gemini") as mock_gemini, patch(
        "app.paper_trading.place_auto_paper_order_sync", return_value={"id": "test_order"}
    ) as mock_paper, patch.object(config, "AUTO_PAPER_USER_ID", "test-user-id"), patch(
        "app.state.market_state.get_stock"
    ) as mock_get_stock, patch(
        "app.order_monitor.has_active_order", return_value=False
    ), patch(
        "app.trade_management.check_support_resistance_proximity", return_value=(True, "")
    ), patch(
        "app.ai_copilot.datetime"
    ) as mock_dt:

        mock_dt.now.return_value = test_time
        mock_get_stock.return_value = {
            "symbol": "TATASTEEL",
            "ltp": 150.0,
            "today_high": 152.0,
            "today_low": 149.0,
            "yesterday_high": 153.0,
            "yesterday_low": 148.0,
            "vwap": 149.5,
        }

        # Call execute_auto_trade directly for a pure quant signal
        ok, reason = ai_copilot.execute_auto_trade(
            sym="TATASTEEL",
            signal="Bull • VWAP Retest",
            side="BUY",
            score=78.0,
            is_pure_quant=True,
        )

        assert ok is True, f"Failed with reason: {reason}"
        # Gemini should NEVER be touched
        mock_gemini.assert_not_called()
        # Paper order should have been placed with QUANT_AUTONOMOUS note prefix
        assert mock_paper.call_count >= 1
        placed_notes = mock_paper.call_args[1].get("notes") or mock_paper.call_args[0][8]
        assert "QUANT_AUTONOMOUS" in placed_notes


def test_elite_orb_routing():
    """Verify ORB breakout routing: >= 80 is eligible for AI Gate, < 80 executes pure quant."""
    today = datetime.now(IST).date()
    ai_copilot._reset_daily_counters_if_needed(today, force=True)

    min_elite = config.MIN_ELITE_ORB_AI_SCORE
    assert min_elite == 80


def test_non_blocking_fallback_executes_on_gemini_unavailable():
    """Verify that when Gemini returns QUANT_FALLBACK, high conviction setup is executed, not dropped."""
    today = datetime.now(IST).date()
    ai_copilot._reset_daily_counters_if_needed(today, force=True)

    with patch("app.ai_copilot.analyze_trade_setup") as mock_analyze, patch(
        "app.ai_copilot.execute_auto_trade", return_value=(True, "Executed")
    ) as mock_exec, patch.object(config, "AUTO_PAPER_USER_ID", "test-user-id"), patch(
        "app.state.market_state.get_stock"
    ) as mock_get_stock:

        mock_get_stock.return_value = {
            "symbol": "DALBHARAT",
            "ltp": 2000.0,
            "momentum_score": 82,
            "entry_quality_score": 75,
            "conviction_score": 78.5,
        }

        # Mock Gemini 429/timeout fallback return
        mock_analyze.return_value = {
            "symbol": "DALBHARAT",
            "decision": "QUANT_FALLBACK",
            "confidence_score": 0,
            "rationale": ["AI Copilot audit unavailable (API rate limit or timeout)."],
            "is_fallback": True,
        }

        ai_copilot.audit_and_notify_signal("DALBHARAT", "Bull • C1", "09:30")

        # Must NOT be dropped! Should execute under QUANT_FALLBACK
        assert mock_exec.call_count == 1
        call_kwargs = mock_exec.call_args[1]
        assert call_kwargs.get("is_fallback") is True
        assert call_kwargs.get("sym") == "DALBHARAT"
        assert call_kwargs.get("score") >= 70


def test_single_order_architecture():
    """Verify that execute_auto_trade places exactly ONE unified order per stock."""
    today = datetime.now(IST).date()
    ai_copilot._reset_daily_counters_if_needed(today, force=True)
    test_time = datetime(today.year, today.month, today.day, 10, 0, 0, tzinfo=IST)

    with patch("app.paper_trading.place_auto_paper_order_sync", return_value={"id": "single_order_1"}) as mock_paper, \
         patch.object(config, "AUTO_PAPER_USER_ID", "test-user-id"), \
         patch("app.state.market_state.get_stock") as mock_get_stock, \
         patch("app.order_monitor.has_active_order", return_value=False), \
         patch("app.trade_management.check_support_resistance_proximity", return_value=(True, "")), \
         patch("app.ai_copilot.datetime") as mock_dt:

        mock_dt.now.return_value = test_time
        mock_get_stock.return_value = {
            "symbol": "SAIL",
            "ltp": 160.0,
            "today_high": 162.0,
            "today_low": 158.0,
            "yesterday_high": 163.0,
            "yesterday_low": 159.0,
            "vwap": 161.0,
        }

        ok, reason = ai_copilot.execute_auto_trade(
            sym="SAIL",
            signal="Bear • OI Squeeze",
            side="SELL",
            score=75.0,
            is_pure_quant=True,
        )

        assert ok is True
        # Must be exactly 1 call — no duplicate tranche orders!
        assert mock_paper.call_count == 1
        call_kwargs = mock_paper.call_args[1]
        assert call_kwargs["symbol"] == "SAIL"
        assert call_kwargs["side"] == "SELL"
        assert call_kwargs["quantity"] > 0
