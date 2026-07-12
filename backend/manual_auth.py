"""
ONE-TIME manual authorization for a newly created Fyers app.

A freshly created Fyers app must be authorized against your account once, in a
browser, before the programmatic TOTP flow will return real auth codes. Run
this once:  python manual_auth.py

It prints the authorize URL, you log in + click Allow, then paste the URL your
browser was redirected to (it will contain ?auth_code=...). We exchange that for
the API access token and cache it, so the dashboard works immediately today and
the automated daily login works from tomorrow.
"""
from urllib.parse import parse_qs, urlparse

from app import auth, config


def main():
    missing = [
        n
        for n, v in {
            "FYERS_CLIENT_ID": config.CLIENT_ID,
            "FYERS_SECRET_KEY": config.SECRET_KEY,
            "FYERS_REDIRECT_URI": config.REDIRECT_URI,
        }.items()
        if not v
    ]
    if missing:
        print("Missing in .env:", ", ".join(missing))
        return

    url = auth.build_login_url()
    print("\n" + "=" * 70)
    print("STEP 1 — open this URL in your browser, log in, and click 'Allow':\n")
    print(url)
    print("\nSTEP 2 — your browser will redirect to your redirect URI, e.g.:")
    print("   https://127.0.0.1:8000/callback?s=ok&code=200&auth_code=XXXX&state=dashboard")
    print("   The page may show a connection error — that's fine. Copy the URL")
    print("   from the address bar (or just the auth_code value).")
    print("=" * 70)

    pasted = input("\nPaste the redirected URL (or the auth_code) here:\n> ").strip()

    if "auth_code=" in pasted:
        auth_code = parse_qs(urlparse(pasted).query).get("auth_code", [""])[0]
    else:
        auth_code = pasted  # assume they pasted the bare code

    if not auth_code:
        print("Could not find an auth_code in what you pasted.")
        return

    print(f"\nExchanging auth_code ({auth_code[:8]}...) for the API access token ...")
    token = auth.exchange_and_cache(auth_code)
    if not token:
        print("Exchange failed (see log above).")
        return

    print(f"\nSUCCESS. Access + refresh tokens cached to {config.TOKEN_CACHE_FILE}")
    print("You can now run `python run.py`. Tomorrow's 08:45 automated login should")
    print("work too now that the app is authorized against your account.")


if __name__ == "__main__":
    main()
