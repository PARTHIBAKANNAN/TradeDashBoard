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
STREAM_INTERVAL = float(os.getenv("STREAM_INTERVAL", "0.25"))
BROADCAST_MAX_QUEUE = int(os.getenv("BROADCAST_MAX_QUEUE", "8"))
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

# ----------------- Dashboard login (Supabase Auth; session cookie bridges to SSE) -----------------
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-insecure-change-me")
# Project URL only — credential verification uses Supabase's public JWKS endpoint,
# no shared secret needed. Empty disables the login gate (dev).
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
# Direct Postgres connection (Supabase -> Project Settings -> Database ->
# Connection string -> Transaction pooler, port 6543). Used for paper-trading
# persistence via asyncpg. Empty disables the paper-trading feature.
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "")

# ----------------- Telegram alerts (position closes + Recommended-tag digest) -----------------
# Create a bot via @BotFather, then message it once and call
# https://api.telegram.org/bot<token>/getUpdates to read your chat_id.
# Both empty disables Telegram alerts entirely (no-op, same as SUPABASE_DB_URL).
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

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
    # Power & Renewables
    "NSE:JSWENERGY-EQ": "Power",
    "NSE:ADANIENSOL-EQ": "Power",
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
    "NSE:MUTHOOTFIN-EQ": "NBFC",
    "NSE:SBICARD-EQ": "NBFC",
    "NSE:BAJAJFINSV-EQ": "NBFC",
    "NSE:JIOFIN-EQ": "NBFC",
    "NSE:BAJFINANCE-EQ": "NBFC",
    "NSE:PFC-EQ": "NBFC",
    "NSE:SHRIRAMFIN-EQ": "NBFC",
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
    # Realty
    "NSE:GODREJPROP-EQ": "Realty",
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
    "NSE:OFSS-EQ": "IT",
    "NSE:HCLTECH-EQ": "IT",
    "NSE:INFY-EQ": "IT",
    "NSE:TATAELXSI-EQ": "IT",
    "NSE:TECHM-EQ": "IT",
    "NSE:TCS-EQ": "IT",
    # Mystery resolved 2026-08-06: LTIMindtree itself renamed its ticker from
    # LTIM to LTM (confirmed via multiple independent sources) — that's why
    # NSE:LTIM-EQ never returned a live quote, not a data/permission issue.
    # Added below as NSE:LTM-EQ. Still worth a live quotes() sanity-check
    # next time the VM is reachable, per this project's standing practice of
    # verifying newly-added symbols before treating them as confirmed-good.
    "NSE:LTM-EQ": "IT",
    "NSE:KAYNES-EQ": "IT",
    # Pharma
    "NSE:LUPIN-EQ": "Pharma",
    "NSE:AUROPHARMA-EQ": "Pharma",
    "NSE:LAURUSLABS-EQ": "Pharma",
    "NSE:DIVISLAB-EQ": "Pharma",
    "NSE:GLENMARK-EQ": "Pharma",
    "NSE:DRREDDY-EQ": "Pharma",
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

    # ---------------------------------------------------------------------
    # F&O universe expansion, batch 1 — 41 additional NSE F&O-eligible names
    # compiled from general knowledge, NOT a live NSE feed. MUST be checked
    # against NSE's current official F&O list before this is treated as
    # authoritative (eligibility is revised periodically by NSE circulars).
    # Kept as one clearly-delimited block (not interleaved into the curated
    # list above) specifically so it's easy to review/revert as a unit and
    # to watch fyers_service.py's "dropping N invalid symbol(s)" startup log
    # against this exact set if any of these turn out wrong/delisted.
    # ---------------------------------------------------------------------
    # Energy / Gas utilities
    "NSE:GAIL-EQ": "Energy",
    "NSE:BPCL-EQ": "Energy",
    # Power
    "NSE:ADANIPOWER-EQ": "Power",
    # Capital Goods / Industrials / Defense
    "NSE:LT-EQ": "Capital Goods",
    "NSE:SIEMENS-EQ": "Capital Goods",
    "NSE:ABB-EQ": "Capital Goods",
    "NSE:BHEL-EQ": "Capital Goods",
    "NSE:BEL-EQ": "Capital Goods",
    "NSE:HAL-EQ": "Capital Goods",
    # Infra / Ports
    "NSE:ADANIPORTS-EQ": "Infra",
    # Telecom
    "NSE:BHARTIARTL-EQ": "Telecom",
    "NSE:IDEA-EQ": "Telecom",
    "NSE:INDUSTOWER-EQ": "Telecom",
    # Consumer Durables
    "NSE:TITAN-EQ": "Consumer Durables",
    "NSE:DIXON-EQ": "Consumer Durables",
    "NSE:HAVELLS-EQ": "Consumer Durables",
    "NSE:CROMPTON-EQ": "Consumer Durables",
    # Paints / FMCG-adjacent
    "NSE:ASIANPAINT-EQ": "FMCG",
    # Chemicals
    "NSE:SRF-EQ": "Chemicals",
    # Aviation
    "NSE:INDIGO-EQ": "Aviation",
    # Retail
    "NSE:TRENT-EQ": "Retail",
    "NSE:VMM-EQ": "Retail",  # Vishal Mega Mart
    # Capital Markets / Fintech
    "NSE:NAUKRI-EQ": "Capital Markets",
    "NSE:MCX-EQ": "Capital Markets",
    "NSE:IEX-EQ": "Capital Markets",
    "NSE:360ONE-EQ": "Capital Markets",  # 360 ONE WAM, formerly IIFL Wealth
    "NSE:MOTILALOFS-EQ": "Capital Markets",
    "NSE:NAM-INDIA-EQ": "Capital Markets",  # Nippon Life India Asset Management
    # Pvt Banks
    "NSE:YESBANK-EQ": "Pvt Banks",
    # Auto / Auto Ancillary
    "NSE:FORCEMOT-EQ": "Auto",
    "NSE:HYUNDAI-EQ": "Auto",
    # NBFC / Financial Services
    "NSE:LTF-EQ": "NBFC",
    "NSE:MFSL-EQ": "NBFC",
    "NSE:ABCAPITAL-EQ": "NBFC",
    "NSE:MANAPPURAM-EQ": "NBFC",
    # Diversified
    "NSE:GRASIM-EQ": "Diversified",
    "NSE:BAJAJHLDNG-EQ": "Diversified",  # holding company, not an operating NBFC

    # ---------------------------------------------------------------------
    # F&O universe expansion, batch 2 — swapped in 2026-08-06 for the 23
    # names removed above that turned out not to be currently NSE F&O
    # eligible (cross-checked against a monthly-updated mirror of NSE's own
    # derivatives symbol list, MaheshTechnicals/FNO-Stocks-list on GitHub,
    # dated 2026-07-01 — same "verify before treating as authoritative"
    # caveat as batch 1: worth a periodic recheck, not a one-time truth).
    # ---------------------------------------------------------------------
    # Capital Goods / Industrials
    "NSE:COCHINSHIP-EQ": "Capital Goods",
    "NSE:GVT&D-EQ": "Capital Goods",  # GE Vernova T&D India
    "NSE:KEI-EQ": "Capital Goods",
    "NSE:POLYCAB-EQ": "Capital Goods",
    # Infra / Logistics
    "NSE:DELHIVERY-EQ": "Infra",
    # Consumer Durables
    "NSE:AMBER-EQ": "Consumer Durables",
    "NSE:PGEL-EQ": "Consumer Durables",  # PG Electroplast
    # Healthcare
    "NSE:APOLLOHOSP-EQ": "Healthcare",
    # FMCG
    "NSE:GODFRYPHLP-EQ": "FMCG",
    "NSE:RADICO-EQ": "FMCG",
    "NSE:SWIGGY-EQ": "FMCG",  # matches ETERNAL's existing FMCG classification
    # Chemicals
    "NSE:PIDILITIND-EQ": "Chemicals",  # correct ticker — not "PIDILITE"
    # IT
    "NSE:KFINTECH-EQ": "IT",  # matches CAMS' existing IT classification
    # Power
    "NSE:WAAREEENER-EQ": "Power",
}


def short_symbol(fyers_symbol: str) -> str:
    """`NSE:TCS-EQ` -> `TCS`, `NSE:NIFTY50-INDEX` -> `NIFTY50`."""
    core = fyers_symbol.split(":", 1)[-1]
    for suffix in ("-EQ", "-INDEX"):
        if core.endswith(suffix):
            return core[: -len(suffix)]
    return core


ALL_SYMBOLS = [BENCHMARK_SYMBOL] + list(WATCHLIST.keys())
