"""
Alice Blue Authentication Module for TradeDashboard / PulseHunter
==================================================================
Manages Alice Blue userSession generation, checksum calculation,
token caching, and JWT expiration validation.

Implements two robust authorization flows:
  1. Automated SSO Vendor Authorization:
     - Directly calls Alice Blue ANT SSO authorization endpoint (/auth/sso/vendor/authorize)
     - Retrieves authorization code from redirectUrl
     - Automatically exchanges authCode via getUserDetails with SHA-256 checksum for
       an Open API vendor userSession (azp: 'alice-kb')
     - Completely bypasses browser pops and internal web session issues
  2. Fallback Quantman-style 4-step direct login:
     - verify/user -> client/enckey -> pwd/validate -> topt/verify
"""

import base64
import hashlib
import json
import logging
import os as _os
import time
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

import requests

from . import config

logger = logging.getLogger(__name__)
IST = ZoneInfo("Asia/Kolkata")

GET_USER_DETAILS_URL = "https://a3.aliceblueonline.com/open-api/od/v1/vendor/getUserDetails"
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
            "pycryptodome is required for Alice Blue direct login. Run: pip install pycryptodome"
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
    app_key = getattr(config, "ALICEBLUE_APP_KEY", "").strip() or getattr(
        config, "ALICEBLUE_APP_CODE", ""
    ).strip()
    return f"https://ant.aliceblueonline.com/?appcode={app_key}"


def is_token_valid(token_str: str, updated_at_str: Optional[str] = None) -> bool:
    """
    Checks whether the Alice Blue JWT session token is structurally valid, unexpired,
    has proper Open API vendor audience ('azp': 'alice-kb'), and was generated
    during today's trading session (since Alice Blue clears active sessions
    overnight between 05:00 and 06:00 AM IST).
    """
    if not token_str:
        return False
    try:
        parts = token_str.split(".")
        if len(parts) < 2:
            return False
        payload_bytes = base64.b64decode(parts[1] + "==")
        payload = json.loads(payload_bytes.decode("utf-8"))

        # 1. Expiration check
        exp = payload.get("exp", 0)
        if exp <= (time.time() + 300):
            return False

        # 2. Scope / Audience check: Must be 'alice-kb' for Open API WebSocket streaming
        azp = payload.get("azp")
        if azp and azp != "alice-kb":
            logger.warning(
                "Cached token has azp='%s' instead of 'alice-kb' — invalid for Open API streaming.",
                azp,
            )
            return False

        # 3. Reject tokens issued on a previous calendar day in IST
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


def fetch_auth_code_direct(user_id: str, app_key: str) -> Optional[str]:
    """
    Directly requests Alice Blue's SSO vendor authorization endpoint:
    POST https://ant.aliceblueonline.com/omk/auth/sso/vendor/authorize
    Payload: {"userId": user_id, "vendor": app_key}
    Returns authorization code string from redirectUrl on success.
    """
    url = f"{_ANT_BASE}/auth/sso/vendor/authorize"
    headers = {
        "content-type": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/126.0.0.0 Safari/537.36"
        ),
        "Origin": "https://ant.aliceblueonline.com",
        "Referer": f"https://ant.aliceblueonline.com/?appcode={app_key}",
    }
    payload = {"userId": user_id, "vendor": app_key}

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=15)
        if resp.status_code != 200:
            logger.error("Alice Blue vendor/authorize HTTP %d: %s", resp.status_code, resp.text)
            return None
        data = resp.json()
        if data.get("status", "").lower() != "ok" or not data.get("result"):
            logger.error("Alice Blue vendor/authorize rejected: %s", data)
            return None

        redirect_url = data["result"][0].get("redirectUrl", "")
        parsed = urllib.parse.urlparse(redirect_url)
        qs = urllib.parse.parse_qs(parsed.query)
        auth_code = qs.get("authCode", [None])[0] or qs.get("auth_code", [None])[0]
        if auth_code:
            logger.info("Successfully acquired Alice Blue authCode via vendor authorize.")
            return auth_code
        logger.error("No authCode found in vendor/authorize redirectUrl: %s", redirect_url)
        return None
    except Exception as e:
        logger.exception("Exception in fetch_auth_code_direct: %s", e)
        return None


def exchange_auth_code_for_session(auth_code: str) -> Optional[str]:
    """
    Exchanges authorization code from Alice Blue redirect for a 24-hr session token.
    Checksum = SHA256(userId + authCode + apiSecret)
    """
    user_id = getattr(config, "ALICEBLUE_USER_ID", "").strip()
    api_secret = getattr(config, "ALICEBLUE_API_SECRET", "").strip() or getattr(
        config, "ALICEBLUE_API_KEY", ""
    ).strip()

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
        user_session = (
            data.get("userSession")
            or data.get("userSID")
            or data.get("data", {}).get("userSession")
            or data.get("data", {}).get("userSID")
        )

        if not user_session and isinstance(data, dict):
            for k in ("session", "token", "sessionID", "userSession"):
                if k in data and isinstance(data[k], str):
                    user_session = data[k]
                    break

        if user_session:
            save_session_token(user_session)
            logger.info("Alice Blue token exchange successful (userSession saved).")
            return user_session
        else:
            logger.error("Could not find userSession in Alice Blue response: %s", data)
            return None

    except Exception as e:
        logger.error("Exception exchanging auth code with Alice Blue: %s", e)
        return None


def login_automatically() -> Optional[str]:
    """
    Performs fully headless daily authentication.
    First tries direct SSO vendor authorization (fastest, generates Open API token),
    then falls back to 4-step direct login if needed.
    """
    user_id = getattr(config, "ALICEBLUE_USER_ID", "").strip()
    app_key = getattr(config, "ALICEBLUE_APP_KEY", "").strip() or getattr(
        config, "ALICEBLUE_APP_CODE", ""
    ).strip()
    api_secret = getattr(config, "ALICEBLUE_API_SECRET", "").strip() or getattr(
        config, "ALICEBLUE_API_KEY", ""
    ).strip()

    if not user_id or not app_key or not api_secret:
        logger.warning(
            "Alice Blue auto-login skipped: ALICEBLUE_USER_ID, APP_KEY, or API_SECRET missing in config."
        )
        return None

    # Step 1: Attempt direct SSO vendor authorization
    try:
        logger.info("Initiating Alice Blue auto-login for user %s with app %s...", user_id, app_key)
        auth_code = fetch_auth_code_direct(user_id, app_key)
        if auth_code:
            token = exchange_auth_code_for_session(auth_code)
            if token and is_token_valid(token):
                logger.info("Alice Blue automatic morning login SUCCEEDED via SSO authorization.")
                return token
            else:
                logger.warning("SSO token exchange returned invalid or rejected token.")
    except Exception as e:
        logger.warning("SSO vendor authorize flow raised exception: %s", e)

    # Step 2: Fallback to 4-step direct login if configured with password and TOTP
    password = getattr(config, "ALICEBLUE_PASSWORD", "").strip()
    totp_key = getattr(config, "ALICEBLUE_TOTP_KEY", "").strip()
    if password and totp_key:
        try:
            logger.info("Attempting fallback 4-step direct login...")
            totp = generate_totp(totp_key)
            token = authenticate_user(user_id, password, totp)
            if token and is_token_valid(token):
                logger.info("Alice Blue fallback direct login SUCCEEDED.")
                return token
        except Exception as e:
            logger.exception("Fallback direct login raised exception: %s", e)

    logger.error("Alice Blue automatic login FAILED.")
    return None


def authenticate_user(
    user_id: str,
    password: str,
    totp: str,
) -> Optional[str]:
    """
    Performs Alice Blue's internal 4-step direct login handshake.
    Used as secondary fallback.
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
        if r1.status_code != 200 or r1.json().get("status", "").lower() not in ("ok", "success", "true"):
            logger.error("verify/user failed: HTTP %d - %s", r1.status_code, r1.text[:300])
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
        if r2.status_code != 200:
            return None
        d2 = r2.json()
        enc_key = None
        if isinstance(d2.get("result"), list) and len(d2["result"]) > 0:
            enc_key = d2["result"][0].get("encKey")
        if not enc_key:
            enc_key = d2.get("encKey") or d2.get("data", {}).get("encKey")
        if not enc_key:
            return None
    except Exception as e:
        logger.error("enckey exception: %s", e)
        return None

    # Step 3: Validate Password
    try:
        encrypted_pwd = _encrypt_password_cryptojs(password, enc_key)
        r3 = session.post(
            f"{_ANT_BASE}/auth/access/v2/pwd/validate",
            json={"userId": user_id, "userData": encrypted_pwd, "source": "WEB"},
            timeout=15,
        )
        if r3.status_code != 200:
            return None
        d3 = r3.json()
        step3_token = None
        if isinstance(d3.get("result"), list) and len(d3["result"]) > 0:
            step3_token = d3["result"][0].get("token")
        if not step3_token:
            step3_token = d3.get("token") or d3.get("data", {}).get("token")
        if not step3_token:
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
        headers4 = {"Authorization": f"Bearer {user_id} WEB {step3_token}"}
        r4 = session.post(
            f"{_ANT_BASE}/auth/access/topt/verify",
            json=payload4,
            headers=headers4,
            timeout=15,
        )
        if r4.status_code != 200:
            return None
        d4 = r4.json()
        user_session = None
        if isinstance(d4.get("result"), list) and len(d4["result"]) > 0:
            user_session = d4["result"][0].get("accessToken") or d4["result"][0].get("userSession")
        if not user_session:
            user_session = d4.get("accessToken") or d4.get("userSession")

        if user_session:
            save_session_token(user_session)
            return user_session
        return None
    except Exception as e:
        logger.error("topt/verify exception: %s", e)
        return None


def auth_status() -> dict:
    """Returns current Alice Blue authentication and streaming health status."""
    token = get_cached_session()
    is_auth = bool(token)
    from . import aliceblue_service

    engine = getattr(aliceblue_service, "aliceblue_engine", None)
    is_connected = bool(engine and engine.connected)
    now = int(time.time())
    exp = None
    if token:
        try:
            parts = token.split(".")
            if len(parts) >= 2:
                payload = json.loads(base64.b64decode(parts[1] + "==").decode("utf-8"))
                exp = payload.get("exp")
        except Exception:
            pass

    return {
        "authenticated": is_auth,
        "connected": is_connected,
        "broker": "aliceblue",
        "client_id": getattr(config, "ALICEBLUE_USER_ID", ""),
        "expires_at": datetime.fromtimestamp(exp, IST).isoformat() if exp else None,
        "seconds_remaining": max(0, exp - now) if exp else 0,
        "tick_count": engine.tick_count if engine else 0,
        "last_tick_time": engine.last_tick_time if engine else 0.0,
    }
