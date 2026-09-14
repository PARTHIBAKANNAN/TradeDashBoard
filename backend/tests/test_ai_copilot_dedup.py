from unittest.mock import patch
from datetime import datetime
from app import config
from app.config import IST
from app.ai_copilot import audit_and_notify_signal, _reset_daily_counters_if_needed


def test_audit_and_notify_signal_symbol_level_deduplication():
    today = datetime.now(IST).date()
    _reset_daily_counters_if_needed(today, force=True)

    with patch("app.telegram_notify.send_message") as mock_send, patch(
        "app.ai_copilot.analyze_trade_setup"
    ) as mock_analyze, patch.object(config, "ENABLE_AI_TELEGRAM_ALERTS", True), patch.object(config, "AUTO_PAPER_USER_ID", ""):

        mock_analyze.return_value = {
            "decision": "BUY",
            "confidence_score": 85,
            "suggested_entry": 100.0,
            "suggested_sl": 98.0,
            "suggested_target": 104.0,
            "rationale": ["Strong momentum"],
        }

        # First trigger for RELIANCE with C0.5 should process
        audit_and_notify_signal("RELIANCE", "Bull • C0.5", "09:30")
        assert mock_send.call_count == 1

        # Second trigger for RELIANCE with C1 should be BLOCKED by symbol-level lock
        audit_and_notify_signal("RELIANCE", "Bull • C1", "09:45")
        assert mock_send.call_count == 1  # count remains 1!


def test_audit_and_notify_signal_quota_cap_enforcement():
    today = datetime.now(IST).date()
    _reset_daily_counters_if_needed(today, force=True)

    with patch("app.telegram_notify.send_message") as mock_send, patch(
        "app.ai_copilot.analyze_trade_setup"
    ) as mock_analyze, patch.object(
        config, "ENABLE_AI_TELEGRAM_ALERTS", True
    ), patch.object(
        config, "ENABLE_MULTI_STRATEGY_DEDUP", True
    ), patch.object(
        config, "AUTO_PAPER_USER_ID", ""
    ):

        mock_analyze.return_value = {
            "decision": "BUY",
            "confidence_score": 88,
            "suggested_entry": 100.0,
            "suggested_sl": 98.0,
            "suggested_target": 104.0,
            "rationale": ["Elite momentum"],
        }

        # Fire 4 manual approval signals across distinct strategies
        audit_and_notify_signal("STOCK_1", "Bull • C0.5", "09:30")
        audit_and_notify_signal("STOCK_2", "Bull • VWAP Retest", "10:15")
        audit_and_notify_signal("STOCK_3", "Bull • Sector Lag", "11:00")
        audit_and_notify_signal("STOCK_4", "Bull • Squeeze Expansion", "11:30")

        # 4 manual alerts + 1 summary alert = 5 sends
        assert mock_send.call_count == 5

        # 5th manual signal (exceeds MAX_DAILY_MANUAL_ALERTS = 4) must be SILENT
        audit_and_notify_signal("STOCK_5", "Bull • C2", "12:00")
        assert mock_send.call_count == 5  # No additional Telegram send!



def test_audit_and_notify_signal_respects_config_toggle():
    with patch("app.telegram_notify.send_message") as mock_send, patch.object(
        config, "ENABLE_AI_TELEGRAM_ALERTS", False
    ):
        audit_and_notify_signal("DISABLE_TEST", "Bull • C2", "10:00")
        assert mock_send.call_count == 0


def test_audit_and_notify_multi_strategy_deduplication():
    today = datetime.now(IST).date()
    _reset_daily_counters_if_needed(today, force=True)

    with patch("app.telegram_notify.send_message") as mock_send, patch(
        "app.ai_copilot.analyze_trade_setup"
    ) as mock_analyze, patch.object(
        config, "ENABLE_AI_TELEGRAM_ALERTS", True
    ), patch.object(
        config, "ENABLE_MULTI_STRATEGY_DEDUP", True
    ), patch.object(
        config, "AUTO_PAPER_USER_ID", ""
    ):

        mock_analyze.return_value = {
            "decision": "BUY",
            "confidence_score": 85,
            "suggested_entry": 100.0,
            "suggested_sl": 98.0,
            "suggested_target": 104.0,
            "rationale": ["Strong momentum"],
        }

        # 1. ORB signal for RELIANCE (Family: ORB_BREAKOUT) -> audited
        audit_and_notify_signal("RELIANCE", "Bull • C0.5", "09:30")
        assert mock_send.call_count == 1

        # 2. Another ORB signal for RELIANCE (Family: ORB_BREAKOUT) -> blocked (same family)
        audit_and_notify_signal("RELIANCE", "Bull • C1", "09:45")
        assert mock_send.call_count == 1

        # 3. VWAP Retest for RELIANCE (Family: VWAP_RETEST) -> allowed (different family)
        audit_and_notify_signal("RELIANCE", "Bull • VWAP Retest", "10:15")
        assert mock_send.call_count == 2


