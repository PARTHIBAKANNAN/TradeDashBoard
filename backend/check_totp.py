"""
Offline TOTP checker — does NOT contact Fyers, so it consumes zero login
attempts. Run from backend/:  python check_totp.py

Prints the code your .env seed generates right now. Open your Fyers
authenticator app on your phone and compare: if the 6 digits differ, your
FYERS_TOTP_SECRET is the wrong seed (that is why login says 'invalid totp').
"""

import time

import pyotp
from app import config

raw = config.TOTP_SECRET or ""
seed = raw.replace(" ", "").strip()

print(f"Seed length (sanitized): {len(seed)}")
if seed != raw:
    print("  NOTE: your seed had spaces/whitespace — they've been stripped here.")
    print("        Update FYERS_TOTP_SECRET in .env to the stripped value too.")

try:
    totp = pyotp.TOTP(seed)
    now = time.time()
    remaining = 30 - int(now) % 30
    print("\n  Previous code :", totp.at(now - 30))
    print(f"  CURRENT code  : {totp.now()}   (valid ~{remaining}s more)")
    print("  Next code     :", totp.at(now + 30))
    print("\nCompare CURRENT code with your Fyers authenticator app RIGHT NOW.")
    print("  - Match   -> seed is correct; the login problem is elsewhere.")
    print("  - Differ  -> wrong seed: re-enroll TOTP in Fyers and copy the exact")
    print("               base32 setup key into FYERS_TOTP_SECRET.")
except Exception as e:  # noqa: BLE001
    print(f"\n[FAIL] pyotp could not use this seed: {e}")
    print("  It is not a valid base32 secret. Get the correct setup key from Fyers.")
