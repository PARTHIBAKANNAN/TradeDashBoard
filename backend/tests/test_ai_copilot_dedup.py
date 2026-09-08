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
    ) as mock_analyze, patch.object(config, "ENABLE_AI_TELEGRAM_ALERTS", True), patch.object(config, "AUTO_PAPER_USER_ID", ""):

        mock_analyze.return_value = {
            "decision": "BUY",
            "confidence_score": 88,
            "suggested_entry": 100.0,
            "suggested_sl": 98.0,
            "suggested_target": 104.0,
            "rationale": ["Elite momentum"],
        }

        # Fire 3 manual approval signals (when AUTO_PAPER_USER_ID is empty)
        audit_and_notify_signal("STOCK_1", "Bull • C0.5", "09:30")
        audit_and_notify_signal("STOCK_2", "Bull • C0.5", "09:30")
        audit_and_notify_signal("STOCK_3", "Bull • C0.5", "09:30")
        
        # 3 manual alerts + 1 summary alert = 4 sends
        assert mock_send.call_count == 4

        # 4th manual signal (exceeds MAX_DAILY_MANUAL_ALERTS = 3) must be SILENT
        audit_and_notify_signal("STOCK_4", "Bull • C0.5", "09:30")
        assert mock_send.call_count == 4  # No additional Telegram send!



def test_audit_and_notify_signal_respects_config_toggle():
    with patch("app.telegram_notify.send_message") as mock_send, patch.object(
        config, "ENABLE_AI_TELEGRAM_ALERTS", False
    ):
        audit_and_notify_signal("DISABLE_TEST", "Bull • C2", "10:00")
        assert mock_send.call_count == 0

