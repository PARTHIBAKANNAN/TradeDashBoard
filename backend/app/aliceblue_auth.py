"""
Alice Blue Authentication Module for TradeDashboard / PulseHunter
==================================================================
Manages Alice Blue userSession generation, checksum calculation,
token caching, and JWT expiration validation.
"""

import hashlib
import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

import requests

from . import config

logger = logging.getLogger(__name__)
IST = ZoneInfo("Asia/Kolkata")

GET_USER_DETAILS_URL = "https://a3.aliceblueonline.com/open-api/od/v1/vendor/getUserDetails"


def get_token_cache_path() -> Path:
    cache_path = Path(getattr(config, "ALICEBLUE_TOKEN_CACHE_FILE", "data/aliceblue_token.json"))
    if not cache_path.is_absolute():
        cache_path = Path(__file__).resolve().parent.parent / cache_path
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    return cache_path


def build_login_url() -> str:
    """Returns the Alice Blue user authorization URL with configured appcode."""
    app_key = getattr(config, "ALICEBLUE_APP_KEY", "").strip()
    return f"https://ant.aliceblueonline.com/?appcode={app_key}"


def is_token_valid(token_str: str) -> bool:
    """Checks whether the Alice Blue JWT session token is structurally valid and unexpired."""
    if not token_str:
        return False
    try:
        parts = token_str.split(".")
        if len(parts) < 2:
            return False
        import base64

        payload_bytes = base64.b64decode(parts[1] + "==")
        payload = json.loads(payload_bytes.decode("utf-8"))
        exp = payload.get("exp", 0)
        # Valid if has at least 5 minutes remaining
        return exp > (time.time() + 300)
    except Exception as e:
        logger.debug("JWT validation exception: %s", e)
        return False


def get_cached_session() -> Optional[str]:
    """Retrieves valid cached session token if available."""
    # 1. Check process environment first
    env_token = getattr(config, "ALICEBLUE_SESSION_TOKEN", "").strip()
    if is_token_valid(env_token):
        return env_token

    # 2. Check token cache file
    cache_path = get_token_cache_path()
    if cache_path.exists():
        try:
            data = json.loads(cache_path.read_text(encoding="utf-8"))
            token = data.get("userSession") or data.get("user_session") or ""
            if is_token_valid(token):
                logger.debug(
                    "Restored valid Alice Blue session token from cache: %s", cache_path.name
                )
                return token
        except Exception as e:
            logger.warning("Failed reading token cache file: %s", e)
    return None


def save_session_token(token: str) -> None:
    """Caches Alice Blue user session token to disk."""
    cache_path = get_token_cache_path()
    try:
        cache_path.write_text(
            json.dumps(
                {
                    "userSession": token,
                    "updated_at": datetime.now(IST).isoformat(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        logger.info("Saved Alice Blue userSession to %s", cache_path)
    except Exception as e:
        logger.warning("Could not persist session token: %s", e)


def exchange_auth_code_for_session(auth_code: str) -> Optional[str]:
    """
    Exchanges authorization code from Alice Blue redirect for a 24-hr session token.
    Checksum = SHA256(userId + authCode + apiSecret)
    """
    user_id = getattr(config, "ALICEBLUE_USER_ID", "").strip()
    api_secret = getattr(config, "ALICEBLUE_API_SECRET", "").strip()

    if not user_id or not api_secret:
        logger.error("Missing ALICEBLUE_USER_ID or ALICEBLUE_API_SECRET in config")
        return None

    raw_str = f"{user_id}{auth_code.strip()}{api_secret}"
    checksum = hashlib.sha256(raw_str.encode("utf-8")).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "TradeDashboard/1.0",
    }
    payload = {"checkSum": checksum}

    try:
        resp = requests.post(GET_USER_DETAILS_URL, json=payload, headers=headers, timeout=15)
        if resp.status_code != 200:
            logger.error("Alice Blue token exchange HTTP %d: %s", resp.status_code, resp.text)
            return None

        data = resp.json()
        logger.info("Alice Blue token exchange response received")

        # Response contains userSession / userSID / token
        user_session = (
            data.get("userSession")
            or data.get("userSID")
            or data.get("data", {}).get("userSession")
            or data.get("data", {}).get("userSID")
        )

        if not user_session:
            # Check if root dictionary has session or token
            if isinstance(data, dict):
                for k in ("session", "token", "sessionID", "userSession"):
                    if k in data and isinstance(data[k], str):
                        user_session = data[k]
                        break

        if user_session:
            save_session_token(user_session)
            return user_session
        else:
            logger.error("Could not find userSession in Alice Blue response: %s", data)
            return None

    except Exception as e:
        logger.error("Exception exchanging auth code with Alice Blue: %s", e)
        return None
