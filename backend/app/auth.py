"""
Automated daily FYERS v3 login.

Fyers access tokens expire every 24h. Instead of the manual OAuth redirect,
this module drives Fyers' programmatic login endpoints using your own
credentials + a TOTP seed, exactly the way headless algo systems authenticate
against their own account:

    send_login_otp -> verify_otp (TOTP) -> verify_pin -> get auth_code -> exchange

The resulting API access token is cached to disk (valid until end of day) so a
mid-day server restart does not force a fresh login.
"""
import base64
import hashlib
import json
import time
from datetime import datetime

import pyotp
import requests
from fyers_apiv3 import fyersModel

from . import config

# Fyers programmatic auth endpoints
URL_SEND_OTP = "https://api-t2.fyers.in/vagator/v2/send_login_otp_v2"
URL_VERIFY_OTP = "https://api-t2.fyers.in/vagator/v2/verify_otp"
URL_VERIFY_PIN = "https://api-t2.fyers.in/vagator/v2/verify_pin_v2"
URL_TOKEN = "https://api-t1.fyers.in/api/v3/token"

# Refresh a few minutes before the real JWT expiry to avoid mid-request lapses.
EXP_SKEW_SECONDS = 120


def _b64(value: str) -> str:
    return base64.b64encode(str(value).encode()).decode()


def _split_client_id(client_id: str):
    """`XXXXXX-100` -> (app_id="XXXXXX", app_type="100")."""
    app_id, _, app_type = client_id.partition("-")
    return app_id, (app_type or "100")


def _fetch_auth_code() -> str:
    """Run the vagator OTP+PIN flow and return the OAuth auth_code."""
    app_id, app_type = _split_client_id(config.CLIENT_ID)

    # 1) request an OTP challenge tied to the login id
    r = requests.post(URL_SEND_OTP, json={"fy_id": _b64(config.FY_ID), "app_id": "2"}, timeout=15)
    r.raise_for_status()
    request_key = r.json()["request_key"]

    # 2) answer the challenge with the current TOTP
    totp = pyotp.TOTP(config.TOTP_SECRET).now()
    r = requests.post(URL_VERIFY_OTP, json={"request_key": request_key, "otp": totp}, timeout=15)
    if r.status_code != 200:
        # TOTP can land on a boundary; retry once with a freshly minted code.
        time.sleep(1)
        totp = pyotp.TOTP(config.TOTP_SECRET).now()
        r = requests.post(URL_VERIFY_OTP, json={"request_key": request_key, "otp": totp}, timeout=15)
    r.raise_for_status()
    request_key = r.json()["request_key"]

    # 3) verify the trading PIN -> yields a short-lived vagator access token
    r = requests.post(
        URL_VERIFY_PIN,
        json={"request_key": request_key, "identity_type": "pin", "identifier": _b64(config.USER_PIN)},
        timeout=15,
    )
    r.raise_for_status()
    vagator_token = r.json()["data"]["access_token"]

    # 4) exchange the vagator token for an OAuth auth_code for this app
    headers = {"authorization": f"Bearer {vagator_token}", "content-type": "application/json"}
    body = {
        "fyers_id": config.FY_ID,
        "app_id": app_id,
        "redirect_uri": config.REDIRECT_URI,
        "appType": app_type,
        "code_challenge": "",
        "state": "dashboard",
        "scope": "",
        "nonce": "",
        "response_type": "code",
        "create_cookie": True,
    }
    r = requests.post(URL_TOKEN, headers=headers, json=body, timeout=15)
    r.raise_for_status()
    data = r.json()

    from urllib.parse import parse_qs, urlparse

    # Preferred: an authorized app returns a redirect URL carrying the real
    # authorization code (?auth_code=..., sub=authorization_code).
    redirect_url = data.get("Url") or data.get("url")
    auth_code = None
    if redirect_url:
        auth_code = parse_qs(urlparse(redirect_url).query).get("auth_code", [None])[0]
    # Fallback for the rare variant that returns the code directly.
    if not auth_code:
        auth_code = (data.get("data") or {}).get("auth")
    if not auth_code:
        raise RuntimeError(
            "No auth code in token response. If this is a newly created app, run "
            "`python manual_auth.py` once to authorize it against your account. "
            f"Fyers response: {data}"
        )
    return auth_code


def _app_id_hash() -> str:
    """SHA-256 hex of `client_id:secret_key` — used by the auth-code and refresh exchanges."""
    return hashlib.sha256(f"{config.CLIENT_ID}:{config.SECRET_KEY}".encode()).hexdigest()


def _exchange_auth_code(auth_code: str) -> tuple[str, str | None]:
    """Exchange an OAuth auth_code for (access_token, refresh_token)."""
    session = fyersModel.SessionModel(
        client_id=config.CLIENT_ID,
        secret_key=config.SECRET_KEY,
        redirect_uri=config.REDIRECT_URI,
        response_type="code",
        grant_type="authorization_code",
    )
    session.set_token(auth_code)
    resp = session.generate_token()
    if "access_token" not in resp:
        raise RuntimeError(f"Token exchange failed: {resp}")
    return resp["access_token"], resp.get("refresh_token")


# ----------------- token cache (real JWT-expiry aware) -----------------
def _token_exp(token: str) -> int | None:
    """Decode a JWT's `exp` claim (seconds since epoch). Best effort."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("exp")
    except Exception:  # noqa: BLE001
        return None


def _read_cache() -> dict:
    try:
        with open(config.TOKEN_CACHE_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _load_cached_token() -> str | None:
    """Return the cached access token only if it is still valid by real JWT expiry."""
    cached = _read_cache()
    token = cached.get("access_token")
    if not token:
        return None
    exp = cached.get("exp") or _token_exp(token)
    now = int(time.time())
    if exp and exp - now > EXP_SKEW_SECONDS:
        return token
    return None


def _load_refresh_token() -> str | None:
    return _read_cache().get("refresh_token")


def _save_cached_token(access_token: str, refresh_token: str | None = None) -> None:
    cached = _read_cache()
    cached["access_token"] = access_token
    cached["exp"] = _token_exp(access_token)
    cached["date"] = datetime.now(config.IST).strftime("%Y-%m-%d")  # kept for readability
    # Preserve an existing refresh token if this call didn't supply a new one.
    if refresh_token:
        cached["refresh_token"] = refresh_token
    with open(config.TOKEN_CACHE_FILE, "w") as f:
        json.dump(cached, f)


# ----------------- refresh-token flow (avoids the daily TOTP dance) -----------------
def refresh_via_token() -> str | None:
    """
    Mint a fresh access token from the stored refresh token (valid ~15 days),
    avoiding the TOTP/auth-code path. Returns None if unavailable/expired.

    NOTE: contract must be verified against the live FYERS API — field names /
    pin encoding may differ; the caller falls back to full login on failure.
    """
    refresh_token = _load_refresh_token()
    if not refresh_token:
        return None
    try:
        body = {
            "grant_type": "refresh_token",
            "appIdHash": _app_id_hash(),
            "refresh_token": refresh_token,
            "pin": config.USER_PIN,
        }
        r = requests.post(config.FYERS_REFRESH_URL, json=body, timeout=15)
        data = r.json()
        token = data.get("access_token")
        if r.status_code == 200 and token:
            _save_cached_token(token)  # refresh_token unchanged
            print("[auth] Access token renewed via refresh token.")
            return token
        print(f"[auth] Refresh-token renewal failed: {data}")
        return None
    except Exception as exc:  # noqa: BLE001
        print(f"[auth] Refresh-token renewal error: {exc}")
        return None


# ----------------- public API -----------------
def build_login_url() -> str:
    """The FYERS OAuth authorize URL for the one-click / manual browser login."""
    session = fyersModel.SessionModel(
        client_id=config.CLIENT_ID,
        secret_key=config.SECRET_KEY,
        redirect_uri=config.REDIRECT_URI,
        response_type="code",
        grant_type="authorization_code",
        state="dashboard",
    )
    return session.generate_authcode()


def exchange_and_cache(auth_code: str) -> str | None:
    """Exchange a browser-obtained auth_code and cache access + refresh tokens."""
    try:
        access_token, refresh_token = _exchange_auth_code(auth_code)
        _save_cached_token(access_token, refresh_token)
        print(f"[auth] Token cached via callback ({access_token[:8]}...).")
        return access_token
    except Exception as exc:  # noqa: BLE001
        print(f"[auth] callback exchange failed: {exc}")
        return None


def auth_status() -> dict:
    """Whether we hold a currently-valid FYERS token, and when it expires."""
    cached = _read_cache()
    token = cached.get("access_token")
    exp = cached.get("exp") or (_token_exp(token) if token else None)
    now = int(time.time())
    valid = bool(token and exp and exp - now > EXP_SKEW_SECONDS)
    return {
        "authenticated": valid,
        "expires_at": datetime.fromtimestamp(exp, config.IST).isoformat() if exp else None,
        "seconds_remaining": max(0, exp - now) if exp else 0,
    }


def get_access_token(force_refresh: bool = False) -> str | None:
    """
    Return a valid FYERS access token via the fallback chain:
        valid cache -> refresh-token -> TOTP auth-code login -> None.
    Returns None (and logs) if a manual browser login is required.
    """
    if not force_refresh:
        cached = _load_cached_token()
        if cached:
            print("[auth] Using cached access token (valid).")
            return cached

    # Prefer the refresh-token flow (no TOTP, no flaky auth-code path).
    token = refresh_via_token()
    if token:
        return token

    if not all([config.CLIENT_ID, config.SECRET_KEY, config.FY_ID, config.USER_PIN, config.TOTP_SECRET]):
        print("[auth] No valid token and no way to refresh — MANUAL LOGIN required "
              "(open the dashboard and click 'Connect FYERS').")
        return None

    try:
        print(f"[auth] Generating fresh access token at {datetime.now(config.IST):%H:%M:%S} IST ...")
        auth_code = _fetch_auth_code()
        access_token, refresh_token = _exchange_auth_code(auth_code)
        _save_cached_token(access_token, refresh_token)
        print(f"[auth] Access token cached ({access_token[:8]}...).")
        return access_token
    except Exception as exc:  # noqa: BLE001 - keep server alive; surface via auth_status()
        print(f"[auth] Automated login failed ({exc}); MANUAL LOGIN may be required.")
        return None
