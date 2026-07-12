"""
Central configuration: environment variables, session timings, and the
watchlist definition. No secrets are ever sent to the frontend — they are
read here from the process environment only.
"""
import os
from datetime import time as dt_time

import pytz
from dotenv import load_dotenv

load_dotenv()

IST = pytz.timezone("Asia/Kolkata")

# ----------------- Secret credentials (backend only) -----------------
CLIENT_ID = os.getenv("FYERS_CLIENT_ID", "")
SECRET_KEY = os.getenv("FYERS_SECRET_KEY", "")
FY_ID = os.getenv("FYERS_FY_ID", "")
USER_PIN = os.getenv("FYERS_USER_PIN", "")
# Strip whitespace: authenticator setup keys are often shown with spaces.
TOTP_SECRET = os.getenv("FYERS_TOTP_SECRET", "").replace(" ", "").strip()
REDIRECT_URI = os.getenv("FYERS_REDIRECT_URI", "https://127.0.0.1:8000/callback")

# ----------------- App tuning -----------------
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]
STREAM_INTERVAL = float(os.getenv("STREAM_INTERVAL", "1.0"))
FORCE_MARKET_OPEN = os.getenv("FORCE_MARKET_OPEN", "false").lower() == "true"

# ----------------- Server / hosting -----------------
HOST = os.getenv("HOST", "127.0.0.1")  # set to 0.0.0.0 when hosted behind a reverse proxy
PORT = int(os.getenv("PORT", "8000"))
# Absolute path to the built React app (frontend/dist). Served same-origin when present.
FRONTEND_DIST = os.getenv(
    "FRONTEND_DIST",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")),
)
# Only ONE instance may open the FYERS websocket (one connection per app). Set false
# on local dev so it never fights the hosted instance for the single socket.
DATA_ENGINE_ENABLED = os.getenv("DATA_ENGINE_ENABLED", "true").lower() == "true"
INSTANCE_NAME = os.getenv("INSTANCE_NAME", "local")

# ----------------- Dashboard login (built-in; future: Razorpay subscriptions) -----------------
ADMIN_USER = os.getenv("ADMIN_USER", "Admin")
ADMIN_PASS = os.getenv("ADMIN_PASS", "")  # set in .env; empty disables the login gate (dev)
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-insecure-change-me")

# ----------------- Token cache & refresh -----------------
# Location where the daily access token is cached (env-configurable → mount a volume when hosted).
TOKEN_CACHE_FILE = os.getenv(
    "TOKEN_CACHE_FILE",
    os.path.join(os.path.dirname(__file__), "..", ".token_cache.json"),
)
FYERS_REFRESH_URL = os.getenv(
    "FYERS_REFRESH_URL", "https://api-t1.fyers.in/api/v3/validate-refresh-token"
)

# ----------------- Session timings (IST) -----------------
MARKET_OPEN = dt_time(9, 15)
MARKET_CLOSE = dt_time(15, 30)
DAILY_LOGIN_TIME = dt_time(8, 45)  # cron trigger for the fresh daily token

# 30-minute Opening Range Breakout candles: (name, start, end)
ORB_CANDLES = [
    ("C1", dt_time(9, 15), dt_time(9, 45)),
    ("C2", dt_time(9, 45), dt_time(10, 15)),
    ("C3", dt_time(10, 15), dt_time(10, 45)),
    ("C4", dt_time(10, 45), dt_time(11, 15)),
]

BENCHMARK_SYMBOL = "NSE:NIFTY50-INDEX"

# ----------------- Watchlist (40+ equities) -----------------
# Fyers symbol format: "NSE:<TICKER>-EQ". Edit freely; sector drives the UI filter.
WATCHLIST = {
    # IT
    "NSE:TCS-EQ": "IT",
    "NSE:INFY-EQ": "IT",
    "NSE:WIPRO-EQ": "IT",
    "NSE:HCLTECH-EQ": "IT",
    "NSE:TECHM-EQ": "IT",
    "NSE:PERSISTENT-EQ": "IT",
    # Banking
    "NSE:HDFCBANK-EQ": "Banking",
    "NSE:ICICIBANK-EQ": "Banking",
    "NSE:SBIN-EQ": "Banking",
    "NSE:AXISBANK-EQ": "Banking",
    "NSE:KOTAKBANK-EQ": "Banking",
    "NSE:INDUSINDBK-EQ": "Banking",
    "NSE:BANKBARODA-EQ": "Banking",
    # Pharma
    "NSE:SUNPHARMA-EQ": "Pharma",
    "NSE:DRREDDY-EQ": "Pharma",
    "NSE:CIPLA-EQ": "Pharma",
    "NSE:DIVISLAB-EQ": "Pharma",
    "NSE:APOLLOHOSP-EQ": "Pharma",
    # Auto
    "NSE:MARUTI-EQ": "Auto",
    "NSE:M&M-EQ": "Auto",
    "NSE:BAJAJ-AUTO-EQ": "Auto",
    "NSE:EICHERMOT-EQ": "Auto",
    "NSE:HEROMOTOCO-EQ": "Auto",
    # Metals
    "NSE:TATASTEEL-EQ": "Metals",
    "NSE:JSWSTEEL-EQ": "Metals",
    "NSE:HINDALCO-EQ": "Metals",
    "NSE:COALINDIA-EQ": "Metals",
    "NSE:VEDL-EQ": "Metals",
    # FMCG
    "NSE:HINDUNILVR-EQ": "FMCG",
    "NSE:ITC-EQ": "FMCG",
    "NSE:NESTLEIND-EQ": "FMCG",
    "NSE:BRITANNIA-EQ": "FMCG",
    "NSE:TATACONSUM-EQ": "FMCG",
    # Energy / Infra
    "NSE:RELIANCE-EQ": "Energy",
    "NSE:ONGC-EQ": "Energy",
    "NSE:NTPC-EQ": "Energy",
    "NSE:POWERGRID-EQ": "Energy",
    "NSE:LT-EQ": "Infra",
    "NSE:ADANIPORTS-EQ": "Infra",
    # Financials / Others
    "NSE:BAJFINANCE-EQ": "Financials",
    "NSE:BAJAJFINSV-EQ": "Financials",
    "NSE:TITAN-EQ": "Consumer",
    "NSE:ASIANPAINT-EQ": "Consumer",
}


def short_symbol(fyers_symbol: str) -> str:
    """`NSE:TCS-EQ` -> `TCS`, `NSE:NIFTY50-INDEX` -> `NIFTY50`."""
    core = fyers_symbol.split(":", 1)[-1]
    for suffix in ("-EQ", "-INDEX"):
        if core.endswith(suffix):
            return core[: -len(suffix)]
    return core


ALL_SYMBOLS = [BENCHMARK_SYMBOL] + list(WATCHLIST.keys())
