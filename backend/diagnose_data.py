"""
REST data diagnostic. Run from backend/:  python diagnose_data.py

Uses the cached access token (no re-login) to call the exact REST endpoints the
backfill uses, and prints the RAW responses so we can see their real structure
and any permission/error messages.
"""

import json
from datetime import datetime, timedelta

from app import auth, config
from app.config import IST
from fyers_apiv3 import fyersModel


def dump(label, obj):
    print(f"\n===== {label} =====")
    try:
        print(json.dumps(obj, indent=2, default=str)[:2500])
    except Exception:
        print(repr(obj)[:2500])


import base64 as _b64


def decode_jwt(tok):
    try:
        p = tok.split(".")[1]
        p += "=" * (-len(p) % 4)
        return json.loads(_b64.urlsafe_b64decode(p))
    except Exception as e:  # noqa: BLE001
        return {"_decode_error": str(e)}


token = auth._load_cached_token()
print("Cached token present:", bool(token))
if token:
    claims = decode_jwt(token)
    exp = claims.get("exp")
    now = int(datetime.now(IST).timestamp())
    print(f"  cached token: iss={claims.get('iss')} sub={claims.get('sub')}")
    if exp:
        print(
            f"  exp={datetime.fromtimestamp(exp, IST):%Y-%m-%d %H:%M:%S} IST  "
            f"({'EXPIRED' if exp < now else 'valid'}; now={datetime.fromtimestamp(now, IST):%H:%M:%S})"
        )

print("\n>>> Forcing a FRESH automated login (consent is done, so this should work) ...")
fresh = auth.get_access_token(force_refresh=True)
print("Fresh token obtained:", bool(fresh))
if fresh:
    fc = decode_jwt(fresh)
    if fc.get("exp"):
        print(
            f"  fresh token exp={datetime.fromtimestamp(fc['exp'], IST):%Y-%m-%d %H:%M:%S} IST  sub={fc.get('sub')}"
        )

token = fresh or token
rest = fyersModel.FyersModel(client_id=config.CLIENT_ID, token=token, is_async=False, log_path="")

# 0) profile — confirms the token actually works for data APIs
try:
    dump("profile()", rest.get_profile())
except Exception as e:  # noqa: BLE001
    print("profile error:", e)

today = datetime.now(IST).date()
print("\nIST 'today' as seen by the server process:", today, "weekday", today.weekday())

# 1) Daily history (previous-day range/close)
dump(
    "history DAILY NSE:TCS-EQ (last 12 days)",
    rest.history(
        {
            "symbol": "NSE:TCS-EQ",
            "resolution": "D",
            "date_format": "1",
            "range_from": (today - timedelta(days=12)).strftime("%Y-%m-%d"),
            "range_to": today.strftime("%Y-%m-%d"),
            "cont_flag": "1",
        }
    ),
)

# 2) 30-min history today (ORB)
dump(
    "history 30-min NSE:TCS-EQ (today)",
    rest.history(
        {
            "symbol": "NSE:TCS-EQ",
            "resolution": "30",
            "date_format": "1",
            "range_from": today.strftime("%Y-%m-%d"),
            "range_to": today.strftime("%Y-%m-%d"),
            "cont_flag": "1",
        }
    ),
)

# 3) Quotes (LTP snapshot)
dump(
    "quotes NSE:TCS-EQ,NSE:NIFTY50-INDEX", rest.quotes({"symbols": "NSE:TCS-EQ,NSE:NIFTY50-INDEX"})
)
