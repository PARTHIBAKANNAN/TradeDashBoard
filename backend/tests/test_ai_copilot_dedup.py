from unittest.mock import patch

from app import config
from app.ai_copilot import audit_and_notify_signal


def test_audit_and_notify_signal_deduplicates():
    with patch("app.telegram_notify.send_message") as mock_send, patch(
        "app.ai_copilot.analyze_trade_setup"
    ) as mock_analyze:

        mock_analyze.return_value = {
            "decision": "BUY",
            "confidence_score": 85,
            "suggested_entry": 100.0,
            "suggested_sl": 98.0,
            "suggested_target": 104.0,
            "rationale": ["Strong momentum"],
        }

        # First trigger should send a message
        audit_and_notify_signal("TEST_STOCK", "Bull • C1", "09:45")
        assert mock_send.call_count == 1

        # Second trigger with SAME stock and signal on same day should NOT send message
        audit_and_notify_signal("TEST_STOCK", "Bull • C1", "09:45")
        assert mock_send.call_count == 1  # count remains 1!


def test_audit_and_notify_signal_respects_config_toggle():
    with patch("app.telegram_notify.send_message") as mock_send, patch.object(
        config, "ENABLE_AI_TELEGRAM_ALERTS", False
    ):

        audit_and_notify_signal("DISABLE_TEST", "Bull • C2", "10:00")
        assert mock_send.call_count == 0
