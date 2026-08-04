"""
Best-effort Telegram push alerts — position closes (SL/TSL/Target/Square-off)
and the Recommended-tag digest, so alerts reach you even when the dashboard
isn't open. `requests` is blocking and already a project dependency, so no
new async HTTP client is added; callers hop this off the event loop via
`asyncio.get_running_loop().run_in_executor(None, send_message, text)`.
"""

import logging

import requests

from . import config

logger = logging.getLogger(__name__)

_API_URL = "https://api.telegram.org/bot{token}/sendMessage"


def send_message(text: str) -> None:
    if not config.TELEGRAM_BOT_TOKEN or not config.TELEGRAM_CHAT_ID:
        return  # feature disabled, same convention as SUPABASE_DB_URL
    try:
        requests.post(
            _API_URL.format(token=config.TELEGRAM_BOT_TOKEN),
            json={"chat_id": config.TELEGRAM_CHAT_ID, "text": text, "parse_mode": "Markdown"},
            timeout=5,
        )
    except Exception:  # noqa: BLE001 — never let a notification failure break the caller
        logger.warning("Telegram send failed", exc_info=True)
