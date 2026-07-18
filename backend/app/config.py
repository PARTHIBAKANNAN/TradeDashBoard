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

# ----------------- Watchlist (curated from user-supplied CSVs) -----------------
# Fyers symbol format: "NSE:<TICKER>-EQ". Edit freely; sector drives the UI filter.
WATCHLIST = {
    # Energy (Oil & Gas)
    "NSE:RELIANCE-EQ": "Energy",
    "NSE:ONGC-EQ": "Energy",
    "NSE:OIL-EQ": "Energy",
    "NSE:COALINDIA-EQ": "Energy",
    "NSE:PETRONET-EQ": "Energy",
    "NSE:IOC-EQ": "Energy",
    "NSE:HINDPETRO-EQ": "Energy",
    "NSE:IGL-EQ": "Energy",
    # Power & Renewables
    "NSE:JSWENERGY-EQ": "Power",
    "NSE:ADANIENSOL-EQ": "Power",
    "NSE:TORNTPOWER-EQ": "Power",
    "NSE:POWERGRID-EQ": "Power",
    "NSE:IREDA-EQ": "Power",
    "NSE:ADANIGREEN-EQ": "Power",
    "NSE:NHPC-EQ": "Power",
    "NSE:NTPC-EQ": "Power",
    "NSE:TATAPOWER-EQ": "Power",
    "NSE:SUZLON-EQ": "Power",
    "NSE:INOXWIND-EQ": "Power",
    "NSE:PREMIERENE-EQ": "Power",
    # Capital Goods / Industrials
    "NSE:SOLARINDS-EQ": "Capital Goods",
    "NSE:CGPOWER-EQ": "Capital Goods",
    "NSE:POWERINDIA-EQ": "Capital Goods",
    "NSE:BDL-EQ": "Capital Goods",
    "NSE:CUMMINSIND-EQ": "Capital Goods",
    "NSE:ASTRAL-EQ": "Capital Goods",
    "NSE:MAZDOCK-EQ": "Capital Goods",
    # Consumer Durables
    "NSE:BLUESTARCO-EQ": "Consumer Durables",
    "NSE:VOLTAS-EQ": "Consumer Durables",
    # Infra / Logistics
    "NSE:GMRAIRPORT-EQ": "Infra",
    "NSE:CONCOR-EQ": "Infra",
    "NSE:RVNL-EQ": "Infra",
    # Auto
    "NSE:ASHOKLEY-EQ": "Auto",
    "NSE:TMPV-EQ": "Auto",  # Tata Motors Passenger Vehicles (post CV/PV demerger)
    "NSE:BAJAJ-AUTO-EQ": "Auto",
    "NSE:TIINDIA-EQ": "Auto",
    "NSE:MOTHERSON-EQ": "Auto",
    "NSE:M&M-EQ": "Auto",
    "NSE:HEROMOTOCO-EQ": "Auto",
    "NSE:EXIDEIND-EQ": "Auto",
    "NSE:SONACOMS-EQ": "Auto",
    "NSE:EICHERMOT-EQ": "Auto",
    "NSE:BOSCHLTD-EQ": "Auto",
    "NSE:TITAGARH-EQ": "Auto",
    "NSE:BHARATFORG-EQ": "Auto",
    "NSE:MARUTI-EQ": "Auto",
    "NSE:UNOMINDA-EQ": "Auto",
    "NSE:TVSMOTOR-EQ": "Auto",
    # Pvt Banks
    "NSE:HDFCBANK-EQ": "Pvt Banks",
    "NSE:ICICIBANK-EQ": "Pvt Banks",
    "NSE:AXISBANK-EQ": "Pvt Banks",
    "NSE:KOTAKBANK-EQ": "Pvt Banks",
    "NSE:FEDERALBNK-EQ": "Pvt Banks",
    "NSE:AUBANK-EQ": "Pvt Banks",
    "NSE:IDFCFIRSTB-EQ": "Pvt Banks",
    "NSE:BANDHANBNK-EQ": "Pvt Banks",
    "NSE:RBLBANK-EQ": "Pvt Banks",
    "NSE:INDUSINDBK-EQ": "Pvt Banks",
    # PSU Banks
    "NSE:PNB-EQ": "PSU Banks",
    "NSE:INDIANB-EQ": "PSU Banks",
    "NSE:CANBK-EQ": "PSU Banks",
    "NSE:BANKINDIA-EQ": "PSU Banks",
    "NSE:UNIONBANK-EQ": "PSU Banks",
    "NSE:SBIN-EQ": "PSU Banks",
    "NSE:BANKBARODA-EQ": "PSU Banks",
    # NBFC / Housing Finance
    "NSE:HDFCAMC-EQ": "NBFC",
    "NSE:RECLTD-EQ": "NBFC",
    "NSE:LICHSGFIN-EQ": "NBFC",
    "NSE:IRFC-EQ": "NBFC",
    "NSE:PNBHOUSING-EQ": "NBFC",
    "NSE:HUDCO-EQ": "NBFC",
    "NSE:MUTHOOTFIN-EQ": "NBFC",
    "NSE:SBICARD-EQ": "NBFC",
    "NSE:BAJAJFINSV-EQ": "NBFC",
    "NSE:JIOFIN-EQ": "NBFC",
    "NSE:BAJFINANCE-EQ": "NBFC",
    "NSE:IIFL-EQ": "NBFC",
    "NSE:PFC-EQ": "NBFC",
    "NSE:SHRIRAMFIN-EQ": "NBFC",
    "NSE:SAMMAANCAP-EQ": "NBFC",
    "NSE:CHOLAFIN-EQ": "NBFC",
    # Insurance
    "NSE:SBILIFE-EQ": "Insurance",
    "NSE:ICICIPRULI-EQ": "Insurance",
    "NSE:ICICIGI-EQ": "Insurance",
    "NSE:LICI-EQ": "Insurance",
    "NSE:HDFCLIFE-EQ": "Insurance",
    # Capital Markets / Fintech
    "NSE:ANGELONE-EQ": "Capital Markets",
    "NSE:BSE-EQ": "Capital Markets",
    "NSE:POLICYBZR-EQ": "Capital Markets",
    "NSE:CDSL-EQ": "Capital Markets",
    "NSE:NUVAMA-EQ": "Capital Markets",
    "NSE:PAYTM-EQ": "Capital Markets",
    # Healthcare
    "NSE:MAXHEALTH-EQ": "Healthcare",
    "NSE:POLYMED-EQ": "Healthcare",
    # Realty
    "NSE:GODREJPROP-EQ": "Realty",
    "NSE:NCC-EQ": "Realty",
    "NSE:LODHA-EQ": "Realty",
    "NSE:PRESTIGE-EQ": "Realty",
    "NSE:DLF-EQ": "Realty",
    "NSE:NBCC-EQ": "Realty",
    "NSE:OBEROIRLTY-EQ": "Realty",
    "NSE:PHOENIXLTD-EQ": "Realty",
    # IT
    "NSE:PERSISTENT-EQ": "IT",
    "NSE:MPHASIS-EQ": "IT",
    "NSE:COFORGE-EQ": "IT",
    "NSE:KPITTECH-EQ": "IT",
    "NSE:WIPRO-EQ": "IT",
    "NSE:CAMS-EQ": "IT",
    "NSE:HFCL-EQ": "IT",
    "NSE:OFSS-EQ": "IT",
    "NSE:CYIENT-EQ": "IT",
    "NSE:HCLTECH-EQ": "IT",
    "NSE:INFY-EQ": "IT",
    "NSE:TATAELXSI-EQ": "IT",
    "NSE:TECHM-EQ": "IT",
    "NSE:TCS-EQ": "IT",
    # LTIMindtree intentionally omitted: NSE:LTIM-EQ returned no live quote and no
    # verified alternate ticker was found before REST access dropped (Zscaler).
    # A single wrong/dead symbol here would break the websocket for ALL stocks —
    # add it back once the correct FYERS symbol is confirmed.
    "NSE:KAYNES-EQ": "IT",
    # Pharma
    "NSE:LUPIN-EQ": "Pharma",
    "NSE:AUROPHARMA-EQ": "Pharma",
    "NSE:LAURUSLABS-EQ": "Pharma",
    "NSE:DIVISLAB-EQ": "Pharma",
    "NSE:GLENMARK-EQ": "Pharma",
    "NSE:DRREDDY-EQ": "Pharma",
    "NSE:PPLPHARMA-EQ": "Pharma",
    "NSE:CIPLA-EQ": "Pharma",
    "NSE:TORNTPHARM-EQ": "Pharma",
    "NSE:BIOCON-EQ": "Pharma",
    "NSE:MANKIND-EQ": "Pharma",
    "NSE:ZYDUSLIFE-EQ": "Pharma",
    "NSE:SUNPHARMA-EQ": "Pharma",
    "NSE:ALKEM-EQ": "Pharma",
    "NSE:FORTIS-EQ": "Pharma",
    # Chemicals / Agro
    "NSE:UPL-EQ": "Chemicals",
    "NSE:PIIND-EQ": "Chemicals",
    # Consumer / FMCG (hospitality, apparel, food-service)
    "NSE:JUBLFOOD-EQ": "Consumer",
    "NSE:INDHOTEL-EQ": "Consumer",
    "NSE:PAGEIND-EQ": "Consumer",
    # FMCG
    "NSE:HINDUNILVR-EQ": "FMCG",
    "NSE:GODREJCP-EQ": "FMCG",
    "NSE:COLPAL-EQ": "FMCG",
    "NSE:VBL-EQ": "FMCG",
    "NSE:BRITANNIA-EQ": "FMCG",
    "NSE:SUPREMEIND-EQ": "FMCG",
    "NSE:MARICO-EQ": "FMCG",
    "NSE:DABUR-EQ": "FMCG",
    "NSE:ITC-EQ": "FMCG",
    "NSE:NESTLEIND-EQ": "FMCG",
    "NSE:UNITDSPR-EQ": "FMCG",  # United Spirits (aka McDowell's)
    "NSE:TATACONSUM-EQ": "FMCG",
    "NSE:DMART-EQ": "FMCG",
    "NSE:KALYANKJIL-EQ": "FMCG",
    "NSE:ETERNAL-EQ": "FMCG",
    "NSE:PATANJALI-EQ": "FMCG",
    "NSE:NYKAA-EQ": "FMCG",
    # Cement
    "NSE:SHREECEM-EQ": "Cement",
    "NSE:DALBHARAT-EQ": "Cement",
    "NSE:ULTRACEMCO-EQ": "Cement",
    "NSE:AMBUJACEM-EQ": "Cement",
    # Metals
    "NSE:ADANIENT-EQ": "Metals",
    "NSE:JSWSTEEL-EQ": "Metals",
    "NSE:NATIONALUM-EQ": "Metals",
    "NSE:HINDALCO-EQ": "Metals",
    "NSE:TATASTEEL-EQ": "Metals",
    "NSE:NMDC-EQ": "Metals",
    "NSE:APLAPOLLO-EQ": "Metals",
    "NSE:JINDALSTEL-EQ": "Metals",
    "NSE:SAIL-EQ": "Metals",
    "NSE:VEDL-EQ": "Metals",
    "NSE:HINDZINC-EQ": "Metals",
}


def short_symbol(fyers_symbol: str) -> str:
    """`NSE:TCS-EQ` -> `TCS`, `NSE:NIFTY50-INDEX` -> `NIFTY50`."""
    core = fyers_symbol.split(":", 1)[-1]
    for suffix in ("-EQ", "-INDEX"):
        if core.endswith(suffix):
            return core[: -len(suffix)]
    return core


ALL_SYMBOLS = [BENCHMARK_SYMBOL] + list(WATCHLIST.keys())
