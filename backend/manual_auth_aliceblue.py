"""
One-time or daily manual authorization helper for Alice Blue.
Run:
    python manual_auth_aliceblue.py
"""

from urllib.parse import parse_qs, urlparse

from app import aliceblue_auth, config


def main():
    missing = [
        n
        for n, v in {
            "ALICEBLUE_USER_ID": config.ALICEBLUE_USER_ID,
            "ALICEBLUE_APP_KEY": config.ALICEBLUE_APP_KEY,
            "ALICEBLUE_API_SECRET": config.ALICEBLUE_API_SECRET,
        }.items()
        if not v
    ]
    if missing:
        print("Missing in .env / config:", ", ".join(missing))
        return

    url = aliceblue_auth.build_login_url()
    print("\n" + "=" * 75)
    print("STEP 1 — Open this URL in your browser, log in, and approve:")
    print(f"\n   {url}\n")
    print("STEP 2 — Your browser will redirect to your Redirect URI, e.g.:")
    print("   https://127.0.0.1:8000/callback?authCode=XXXXX")
    print("   Copy the full URL or just the authCode value.")
    print("=" * 75)

    pasted = input("\nPaste redirected URL (or authCode) here:\n> ").strip()
    if not pasted:
        print("No input provided.")
        return

    auth_code = ""
    if "authCode=" in pasted or "auth_code=" in pasted:
        query = parse_qs(urlparse(pasted).query)
        auth_code = query.get("authCode", [""])[0] or query.get("auth_code", [""])[0]
    else:
        auth_code = pasted

    if not auth_code:
        print("Could not find authCode in the provided input.")
        return

    print(f"\nExchanging authCode ({auth_code[:8]}...) with Alice Blue...")
    token = aliceblue_auth.exchange_auth_code_for_session(auth_code)
    if token:
        print("\nSUCCESS! Alice Blue session token acquired and cached to:")
        print(f"   {aliceblue_auth.get_token_cache_path()}")
        print("\nTradeDashboard backend is now ready to stream live ticks via Alice Blue!")
    else:
        print("\nExchange failed. Please check error logs above.")


if __name__ == "__main__":
    main()
