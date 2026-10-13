"""
Alice Blue Authentication Module for TradeDashboard / PulseHunter
==================================================================
Manages Alice Blue userSession generation, checksum calculation,
token caching, and JWT expiration validation.

Also implements the internal 4-step direct-login flow (Quantman-style):
  1. verify/user        - confirm user exists
  2. client/enckey      - get per-session AES encryption key
  3. pwd/validate       - submit encrypted password with source: 'WEB'
  4. topt/verify        - submit TOTP with Bearer header -> receive accessToken JWT
"""

import base64
import hashlib
import json
import logging
import os as _os
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

# Alice Blue internal ANT API base (reverse-engineered from JS bundle index-45cb44ad.js)
_ANT_BASE = "https://ant.aliceblueonline.com/omk"

_ANT_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Origin": "https://ant.aliceblueonline.com",
    "Referer": "https://ant.aliceblueonline.com/",
}


def _evp_bytes_to_key(password: bytes, salt: bytes, key_len: int, iv_len: int):
    """OpenSSL EVP_BytesToKey with MD5 - identical to what CryptoJS uses by default."""
    d = b""
    d_i = b""
    while len(d) < key_len + iv_len:
        d_i = hashlib.md5(d_i + password + salt).digest()
        d += d_i
    return d[:key_len], d[key_len : key_len + iv_len]


def _encrypt_password_cryptojs(password: str, enc_key: str) -> str:
    """
    Encrypts password with AES-256-CBC using CryptoJS conventions.
    Exactly matches CryptoJS.AES.encrypt(password, encKey).toString()
    """
    try:
        from Crypto.Cipher import AES
        from Crypto.Util.Padding import pad
    except ImportError:
        raise RuntimeError(
            "pycryptodome is required for Alice Blue direct login. " "Run: pip install pycryptodome"
        )

    salt = _os.urandom(8)
    key, iv = _evp_bytes_to_key(enc_key.encode("utf-8"), salt, 32, 16)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    ct = cipher.encrypt(pad(password.encode("utf-8"), AES.block_size))
    return base64.b64encode(b"Salted__" + salt + ct).decode("utf-8")


def generate_totp(totp_key: str) -> str:
    """Generates a 6-digit TOTP from a Base32 TOTP secret (RFC 6238)."""
    try:
        import pyotp

        return pyotp.TOTP(totp_key).now()
    except ImportError:
        raise RuntimeError("pyotp is required: pip install pyotp")


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


def is_token_valid(token_str: str, updated_at_str: Optional[str] = None) -> bool:
    """
    Checks whether the Alice Blue JWT session token is structurally valid, unexpired,
    and generated during today's trading session (since Alice Blue clears active
    sessions overnight between 05:00 and 06:00 AM IST).
    """
    if not token_str:
        return False
    try:
        parts = token_str.split(".")
        if len(parts) < 2:
            return False
        payload_bytes = base64.b64decode(parts[1] + "==")
        payload = json.loads(payload_bytes.decode("utf-8"))
        exp = payload.get("exp", 0)
        if exp <= (time.time() + 300):
            return False

        # Reject tokens issued on a previous calendar day in IST
        iat = payload.get("iat", 0)
        now_ist = datetime.now(IST)
        if iat:
            iat_date = datetime.fromtimestamp(iat, tz=IST).date()
            if iat_date < now_ist.date():
                logger.info(
                    "Alice Blue session token was issued on %s (< today %s) - expired for morning login.",
                    iat_date,
                    now_ist.date(),
                )
                return False

        if updated_at_str:
            updated_dt = datetime.fromisoformat(updated_at_str)
            if updated_dt.date() != now_ist.date():
                return False
            # If generated before 06:00 AM IST today, Alice Blue overnight wipe invalidates it
            if updated_dt.time().hour < 6 and now_ist.time().hour >= 6:
                return False

        return True
    except Exception as e:
        logger.debug("JWT validation exception: %s", e)
        return False


def get_cached_session() -> Optional[str]:
    """Retrieves valid cached session token if available and generated for today's session."""
    env_token = getattr(config, "ALICEBLUE_SESSION_TOKEN", "").strip()
    if is_token_valid(env_token):
        return env_token

    cache_path = get_token_cache_path()
    if cache_path.exists():
        try:
            data = json.loads(cache_path.read_text(encoding="utf-8"))
            token = data.get("userSession") or data.get("user_session") or ""
            updated_at = data.get("updated_at")
            if is_token_valid(token, updated_at):
                logger.debug(
                    "Restored valid Alice Blue session token from cache: %s", cache_path.name
                )
                return token
        except Exception as e:
            logger.warning("Failed reading token cache file: %s", e)
    return None


def login_automatically() -> Optional[str]:
    """
    Performs fully headless daily authentication using configured
    ALICEBLUE_USER_ID, ALICEBLUE_PASSWORD, and dynamic TOTP generated from ALICEBLUE_TOTP_KEY.
    """
    user_id = getattr(config, "ALICEBLUE_USER_ID", "").strip()
    password = getattr(config, "ALICEBLUE_PASSWORD", "").strip()
    totp_key = getattr(config, "ALICEBLUE_TOTP_KEY", "").strip()

    if not user_id or not password or not totp_key:
        logger.warning(
            "Alice Blue auto-login skipped: ALICEBLUE_USER_ID, PASSWORD, or TOTP_KEY missing in config."
        )
        return None

    try:
        totp = generate_totp(totp_key)
        logger.info(
            "Generated daily TOTP for Alice Blue user %s. Initiating auto-login...", user_id
        )
        token = authenticate_user(user_id, password, totp)
        if token:
            logger.info("Alice Blue automatic morning login SUCCEEDED.")
            return token
        else:
            logger.error("Alice Blue automatic morning login FAILED.")
            return None
    except Exception as e:
        logger.exception("Alice Blue automatic morning login raised exception: %s", e)
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


def clear_cached_session() -> None:
    """Removes the cached Alice Blue session token from disk."""
    cache_path = get_token_cache_path()
    try:
        if cache_path.exists():
            cache_path.unlink()
            logger.info("Cleared cached Alice Blue session token: %s", cache_path)
    except Exception as e:
        logger.warning("Could not clear cached token: %s", e)


def authenticate_user(
    user_id: str,
    password: str,
    totp: str,
) -> Optional[str]:
    """
    Performs Alice Blue's internal 4-step direct login handshake and returns the
    userSession JWT on success, or None on failure.

    Steps (reverse-engineered from ant.aliceblueonline.com JS bundle):
      1. POST /auth/access/verify/user      - verify user exists
      2. POST /auth/access/client/enckey    - fetch AES encryption key
      3. POST /auth/access/v2/pwd/validate  - submit encrypted password with source: 'WEB'
      4. POST /auth/access/topt/verify      - submit TOTP with Bearer header -> get accessToken JWT
    """
    session = requests.Session()
    session.headers.update(_ANT_HEADERS)

    # Step 1: Verify User
    try:
        r1 = session.post(
            f"{_ANT_BASE}/auth/access/verify/user",
            json={"userId": user_id},
            timeout=15,
        )
        logger.debug("verify/user status=%d body=%s", r1.status_code, r1.text[:300])
        if r1.status_code != 200:
            logger.error("verify/user failed: HTTP %d - %s", r1.status_code, r1.text[:300])
            return None
        d1 = r1.json()
        if d1.get("status", "").lower() not in ("ok", "success", "true"):
            logger.error("verify/user bad status: %s", d1)
            return None
    except Exception as e:
        logger.error("verify/user exception: %s", e)
        return None

    # Step 2: Get Encryption Key
    try:
        r2 = session.post(
            f"{_ANT_BASE}/auth/access/client/enckey",
            json={"userId": user_id},
            timeout=15,
        )
        logger.debug("enckey status=%d body=%s", r2.status_code, r2.text[:300])
        if r2.status_code != 200:
            logger.error("enckey failed: HTTP %d - %s", r2.status_code, r2.text[:300])
            return None
        d2 = r2.json()
        enc_key = None
        if isinstance(d2.get("result"), list) and len(d2["result"]) > 0:
            enc_key = d2["result"][0].get("encKey")
        if not enc_key:
            enc_key = (
                d2.get("encKey")
                or d2.get("data", {}).get("encKey")
                or d2.get("result", {}).get("encKey")
            )
        if not enc_key:
            logger.error("enckey response missing encKey: %s", d2)
            return None
    except Exception as e:
        logger.error("enckey exception: %s", e)
        return None

    # Step 3: Validate Password
    try:
        encrypted_pwd = _encrypt_password_cryptojs(password, enc_key)

        r3 = session.post(
            f"{_ANT_BASE}/auth/access/v2/pwd/validate",
            json={
                "userId": user_id,
                "userData": encrypted_pwd,
                "source": "WEB",
            },
            timeout=15,
        )
        logger.debug("pwd/validate status=%d body=%s", r3.status_code, r3.text[:300])
        if r3.status_code != 200:
            logger.error("pwd/validate failed: HTTP %d - %s", r3.status_code, r3.text[:300])
            return None
        d3 = r3.json()
        if d3.get("status", "").lower() not in ("ok", "success", "true"):
            logger.error("pwd/validate rejected: %s", d3)
            return None

        step3_token = None
        if isinstance(d3.get("result"), list) and len(d3["result"]) > 0:
            step3_token = d3["result"][0].get("token")
        if not step3_token:
            step3_token = d3.get("token") or d3.get("data", {}).get("token")
        if not step3_token:
            logger.error("pwd/validate missing token: %s", d3)
            return None
    except Exception as e:
        logger.error("pwd/validate exception: %s", e)
        return None

    # Step 4: Validate TOTP
    try:
        payload4 = {
            "userId": user_id,
            "totp": totp,
            "source": "WEB",
            "deviceId": "web_browser",
            "deviceNumber": "web_browser",
        }
        headers4 = {
            "Authorization": f"Bearer {user_id} WEB {step3_token}",
        }
        r4 = session.post(
            f"{_ANT_BASE}/auth/access/topt/verify",
            json=payload4,
            headers=headers4,
            timeout=15,
        )
        logger.debug("topt/verify status=%d body=%s", r4.status_code, r4.text[:500])
        if r4.status_code != 200:
            logger.error("topt/verify failed: HTTP %d - %s", r4.status_code, r4.text[:300])
            return None
        d4 = r4.json()
        if d4.get("status", "").lower() not in ("ok", "success", "true"):
            logger.error("topt/verify rejected: %s", d4)
            return None

        user_session = None
        if isinstance(d4.get("result"), list) and len(d4["result"]) > 0:
            user_session = d4["result"][0].get("accessToken") or d4["result"][0].get("userSession")
        if not user_session:
            user_session = (
                d4.get("accessToken")
                or d4.get("userSession")
                or d4.get("data", {}).get("accessToken")
                or d4.get("data", {}).get("userSession")
            )

        if user_session:
            save_session_token(user_session)
            logger.info("Alice Blue direct login successful - session cached.")
            return user_session
        else:
            logger.error("topt/verify: no accessToken in response: %s", d4)
            return None
    except Exception as e:
        logger.error("topt/verify exception: %s", e)
        return None


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

        user_session = (
            data.get("userSession")
            or data.get("userSID")
            or data.get("data", {}).get("userSession")
            or data.get("data", {}).get("userSID")
        )

        if not user_session:
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
