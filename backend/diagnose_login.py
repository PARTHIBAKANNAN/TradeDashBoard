"""
Login contract diagnostic. Run from backend/:  python diagnose_login.py

Reads your .env, then walks the Fyers programmatic login step by step, printing
the HTTP status and response body at each stage so we can see exactly which
call fyers rejects and why. Credentials are NEVER printed (only masked lengths).
"""

import base64

import pyotp
import requests
from app import config


def mask(v):
    if not v:
        return "<EMPTY>"
    return f"{v[:2]}…{v[-1:]} (len {len(v)})"


def b64(v):
    return base64.b64encode(str(v).encode()).decode()


print("=== Config (masked) ===")
print(f"  CLIENT_ID    : {mask(config.CLIENT_ID)}")
print(f"  SECRET_KEY   : {mask(config.SECRET_KEY)}")
print(f"  FY_ID        : {mask(config.FY_ID)}")
print(f"  USER_PIN     : {mask(config.USER_PIN)}")
print(f"  TOTP_SECRET  : {mask(config.TOTP_SECRET)}")
print(f"  REDIRECT_URI : {config.REDIRECT_URI}")

# Sanity checks on formats
issues = []
placeholders = {
    "FYERS_CLIENT_ID": ("XXXXXX-100", config.CLIENT_ID),
    "FYERS_SECRET_KEY": ("YOURSECRETKEY", config.SECRET_KEY),
    "FYERS_FY_ID": ("XY00000", config.FY_ID),
    "FYERS_TOTP_SECRET": ("BASE32TOTPSEED", config.TOTP_SECRET),
}
still_placeholder = [name for name, (ph, val) in placeholders.items() if val == ph]
if still_placeholder:
    issues.append(
        "These .env values are STILL the example placeholders: " + ", ".join(still_placeholder)
    )

if config.CLIENT_ID and "-" not in config.CLIENT_ID:
    issues.append("CLIENT_ID has no '-' (expected APPID-TYPE, e.g. XXXX-100)")
try:
    code = pyotp.TOTP(config.TOTP_SECRET).now()
    print(f"  TOTP now()   : OK (generated a {len(code)}-digit code)")
except Exception as e:  # noqa: BLE001
    issues.append(f"TOTP_SECRET invalid base32: {e}")
if config.USER_PIN and not config.USER_PIN.isdigit():
    issues.append("USER_PIN is not all digits")
if issues:
    print("\n  [!] Format issues:")
    for i in issues:
        print(f"    - {i}")
    if still_placeholder:
        print("\n  Fill in real credentials in backend/.env before the login can work.")
        raise SystemExit(1)

BASE = "https://api-t2.fyers.in/vagator/v2"


def show(label, resp):
    print(f"\n--- {label} -> HTTP {resp.status_code} ---")
    try:
        print("  body:", resp.json())
    except Exception:  # noqa: BLE001
        print("  text:", resp.text[:500])


print("\n=== Step 1: send_login_otp ===")
request_key = None
for ep in ("send_login_otp", "send_login_otp_v2"):
    r = requests.post(f"{BASE}/{ep}", json={"fy_id": b64(config.FY_ID), "app_id": "2"}, timeout=15)
    show(ep, r)
    if r.status_code == 200 and "request_key" in r.json():
        request_key = r.json()["request_key"]
        print(f"  [OK] '{ep}' worked; using it.")
        break

if not request_key:
    print("\n[FAIL] Could not get a request_key. Fix Step 1 before continuing.")
    print("  Common causes: wrong FY_ID (should be your Fyers login id, uppercase),")
    print("  or the app_id constant. Share the body above.")
    raise SystemExit(1)

print("\n=== Step 2: verify_otp (boundary-safe, with one retry) ===")
import time as _time


def _fresh_totp():
    # Avoid the tail of a 30s window so the code doesn't roll over mid-request.
    rem = 30 - int(_time.time()) % 30
    if rem < 6:
        _time.sleep(rem + 1)
    return pyotp.TOTP(config.TOTP_SECRET).now()


r = requests.post(
    f"{BASE}/verify_otp", json={"request_key": request_key, "otp": _fresh_totp()}, timeout=15
)
if r.status_code != 200:
    print(f"  first attempt HTTP {r.status_code}; retrying with a fresh code ...")
    _time.sleep(1)
    r = requests.post(
        f"{BASE}/verify_otp", json={"request_key": request_key, "otp": _fresh_totp()}, timeout=15
    )
show("verify_otp", r)
if r.status_code != 200:
    print("[FAIL] verify_otp failed twice. If it says 'invalid totp' but check_totp.py")
    print("  matches your app, this is usually transient — re-run. Share the body above.")
    raise SystemExit(1)
request_key = r.json()["request_key"]

print("\n=== Step 3: verify_pin ===")
vagator_token = None
for ep in ("verify_pin", "verify_pin_v2"):
    r = requests.post(
        f"{BASE}/{ep}",
        json={
            "request_key": request_key,
            "identity_type": "pin",
            "identifier": b64(config.USER_PIN),
        },
        timeout=15,
    )
    show(ep, r)
    if r.status_code == 200:
        print(f"  [OK] '{ep}' worked.")
        vagator_token = r.json().get("data", {}).get("access_token")
        break
else:
    print("[FAIL] verify_pin failed — check USER_PIN. Share the body above.")
    raise SystemExit(1)

import base64 as _b64
import json as _json
from urllib.parse import parse_qs, urlparse

from fyers_apiv3 import fyersModel

app_id, _, app_type = config.CLIENT_ID.partition("-")
app_type = app_type or "100"
headers = {"authorization": f"Bearer {vagator_token}", "content-type": "application/json"}


def jwt_sub(token):
    """Decode a JWT's payload and return its 'sub' (best effort)."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return _json.loads(_b64.urlsafe_b64decode(payload)).get("sub")
    except Exception:  # noqa: BLE001
        return "?"


def try_exchange(label, auth_code):
    if not auth_code:
        print(f"  [{label}] no auth_code produced.")
        return None
    print(f"  [{label}] auth_code {mask(auth_code)}  sub={jwt_sub(auth_code)}")
    s = fyersModel.SessionModel(
        client_id=config.CLIENT_ID,
        secret_key=config.SECRET_KEY,
        redirect_uri=config.REDIRECT_URI,
        response_type="code",
        grant_type="authorization_code",
    )
    s.set_token(auth_code)
    resp = s.generate_token()
    if resp.get("access_token"):
        print(f"  [{label}] >>> SUCCESS: final access token {mask(resp['access_token'])}")
        return resp["access_token"]
    print(f"  [{label}] exchange failed: {resp}")
    return None


def base_body(create_cookie):
    b = {
        "fyers_id": config.FY_ID,
        "app_id": app_id,
        "redirect_uri": config.REDIRECT_URI,
        "appType": app_type,
        "code_challenge": "",
        "state": "dashboard",
        "scope": "",
        "nonce": "",
        "response_type": "code",
    }
    if create_cookie is not None:
        b["create_cookie"] = create_cookie
    return b


print("\n=== Step 4: obtaining an auth_code ===")
final_token = None

# First get data.auth (the intermediate authorization access token).
r = requests.post(
    "https://api-t1.fyers.in/api/v3/token", headers=headers, json=base_body(True), timeout=15
)
dataA = r.json()
auth_access = (dataA.get("data") or {}).get("auth")
print(
    f"  data.auth obtained: {mask(auth_access)}  sub={jwt_sub(auth_access) if auth_access else None}"
)

sess = fyersModel.SessionModel(
    client_id=config.CLIENT_ID,
    secret_key=config.SECRET_KEY,
    redirect_uri=config.REDIRECT_URI,
    response_type="code",
    grant_type="authorization_code",
    state="dashboard",
)
authorize_url = sess.generate_authcode()


def extract_code_from_response(resp):
    loc = resp.headers.get("Location") or resp.headers.get("location")
    if loc:
        code = parse_qs(urlparse(loc).query).get("auth_code", [None])[0]
        if code:
            return code, f"redirect Location ({loc[:70]}...)"
    ctype = resp.headers.get("content-type", "")
    if ctype.startswith("application/json"):
        j = resp.json()
        url = j.get("Url") or j.get("url")
        if url:
            code = parse_qs(urlparse(url).query).get("auth_code", [None])[0]
            if code:
                return code, "json Url"
        nested = (j.get("data") or {}).get("auth_code") or j.get("auth_code")
        if nested:
            return nested, "json auth_code"
        return None, f"json body: {str(j)[:200]}"
    return None, f"HTML/other body[:150]: {resp.text[:150]}"


# Method D: GET generate-authcode with Bearer = data.auth
print("\n-- Method D: GET generate-authcode, Bearer=data.auth --")
r = requests.get(
    authorize_url,
    headers={"authorization": f"Bearer {auth_access}"},
    allow_redirects=False,
    timeout=15,
)
codeD, howD = extract_code_from_response(r)
print(f"  HTTP {r.status_code}; source: {howD}")
if codeD:
    print(f"  code sub={jwt_sub(codeD)}")
final_token = try_exchange("D", codeD) or final_token

# Method E: cookie session — POST token(create_cookie) then GET generate-authcode via same session
if not final_token:
    print("\n-- Method E: cookie session (token -> generate-authcode) --")
    s = requests.Session()
    s.post(
        "https://api-t1.fyers.in/api/v3/token", headers=headers, json=base_body(True), timeout=15
    )
    print(f"  cookies after token POST: {list(s.cookies.keys())}")
    r = s.get(authorize_url, allow_redirects=False, timeout=15)
    codeE, howE = extract_code_from_response(r)
    print(f"  HTTP {r.status_code}; source: {howE}")
    if codeE:
        print(f"  code sub={jwt_sub(codeE)}")
    final_token = try_exchange("E", codeE) or final_token

print()
if final_token:
    print("[OK][OK] Auth solved. Tell me which Method (D/E) printed SUCCESS and")
    print("         I'll lock that path into auth.py.")
else:
    print("[FAIL] Neither method produced a working token. Share all output above.")
