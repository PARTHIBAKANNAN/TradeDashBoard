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
ENABLE_AI_TELEGRAM_ALERTS = os.getenv("ENABLE_AI_TELEGRAM_ALERTS", "true").lower() in (
    "true",
    "1",
    "yes",
)

# ----------------- Quant Gatekeeper — signal quality gates -----------------
# All three gates must pass simultaneously before Gemini is called.
# Configurable via .env so thresholds can be tightened during choppy markets
# without a code deploy.
#
# MIN_RS_THRESHOLD: Minimum Intraday Relative Strength vs NIFTY (%).
#   Bull signal → RS must be >= +MIN_RS_THRESHOLD (stock outperforming NIFTY).
#   Bear signal → RS must be <= -MIN_RS_THRESHOLD (stock underperforming NIFTY).
MIN_RS_THRESHOLD = float(os.getenv("MIN_RS_THRESHOLD", "0.50"))
#
# MIN_RVOL_THRESHOLD: Minimum relative volume ratio (today's traded value vs
#   estimated average daily traded value).  A value > 1.0 means above-average
#   participation; 2.0 means 2x normal volume — strong institutional interest.
#   Computed as:  (today_traded_value / estimated_avg_daily_traded_value)
#   where avg is approximated from the 9.15–9.45 AM volume run-rate.
MIN_RVOL_THRESHOLD = float(os.getenv("MIN_RVOL_THRESHOLD", "2.0"))
#
# MIN_AI_CONFIDENCE: Gemini confidence score floor. Only execute (or alert) when
#   score >= this value.  80 is conservatively high — treats all below-80 as noise.
MIN_AI_CONFIDENCE = int(os.getenv("MIN_AI_CONFIDENCE", "80"))

# ----------------- Auto paper trade execution -----------------
# DAILY_MAX_RISK_INR: Maximum total risk (capital at stake) across ALL auto
#   paper trades in a single trading day.  ₹2,000 = stop loss across all trades.
DAILY_MAX_RISK_INR = float(os.getenv("DAILY_MAX_RISK_INR", "2000.0"))
#
# MAX_DAILY_AUTO_TRADES: Hard cap on the number of auto paper trades per day.
#   Risk per trade = DAILY_MAX_RISK_INR / MAX_DAILY_AUTO_TRADES.
MAX_DAILY_AUTO_TRADES = int(os.getenv("MAX_DAILY_AUTO_TRADES", "3"))
#
# AUTO_EXECUTE_UNTIL_MINUTE: Session minute cutoff for auto-execution.
#   Session minute 0 = 09:15 AM.  105 = 11:00 AM.  After this, Gemini sends
#   a Telegram alert but does NOT auto-place the order (manual approval needed).
AUTO_EXECUTE_UNTIL_MINUTE = int(os.getenv("AUTO_EXECUTE_UNTIL_MINUTE", "105"))
#
# AUTO_PAPER_USER_ID: The user_id (from auth.users) under which auto paper
#   trades are placed. Must match a valid user in the Supabase auth table.
#   Leave empty to disable auto-execution even when all other gates pass.
AUTO_PAPER_USER_ID = os.getenv("AUTO_PAPER_USER_ID", "")

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
    # Nifty 50
    "NSE:RELIANCE-EQ": "Nifty 50",
    "NSE:ONGC-EQ": "Nifty 50",
    "NSE:COALINDIA-EQ": "Nifty 50",
    "NSE:POWERGRID-EQ": "Nifty 50",
    "NSE:NTPC-EQ": "Nifty 50",
    "NSE:TMPV-EQ": "Nifty 50",  # Tata Motors Passenger Vehicles (post CV/PV demerger)
    "NSE:BAJAJ-AUTO-EQ": "Nifty 50",
    "NSE:M&M-EQ": "Nifty 50",
    "NSE:EICHERMOT-EQ": "Nifty 50",
    "NSE:MARUTI-EQ": "Nifty 50",
    "NSE:HDFCBANK-EQ": "Nifty 50",
    "NSE:ICICIBANK-EQ": "Nifty 50",
    "NSE:AXISBANK-EQ": "Nifty 50",
    "NSE:KOTAKBANK-EQ": "Nifty 50",
    "NSE:SBIN-EQ": "Nifty 50",
    "NSE:BAJAJFINSV-EQ": "Nifty 50",
    "NSE:JIOFIN-EQ": "Nifty 50",
    "NSE:BAJFINANCE-EQ": "Nifty 50",
    "NSE:SHRIRAMFIN-EQ": "Nifty 50",
    "NSE:SBILIFE-EQ": "Nifty 50",
    "NSE:HDFCLIFE-EQ": "Nifty 50",
    "NSE:MAXHEALTH-EQ": "Nifty 50",
    "NSE:WIPRO-EQ": "Nifty 50",
    "NSE:HCLTECH-EQ": "Nifty 50",
    "NSE:INFY-EQ": "Nifty 50",
    "NSE:TECHM-EQ": "Nifty 50",
    "NSE:TCS-EQ": "Nifty 50",
    "NSE:DRREDDY-EQ": "Nifty 50",
    "NSE:CIPLA-EQ": "Nifty 50",
    "NSE:SUNPHARMA-EQ": "Nifty 50",
    "NSE:HINDUNILVR-EQ": "Nifty 50",
    "NSE:ITC-EQ": "Nifty 50",
    "NSE:NESTLEIND-EQ": "Nifty 50",
    "NSE:TATACONSUM-EQ": "Nifty 50",
    "NSE:ETERNAL-EQ": "Nifty 50",
    "NSE:ULTRACEMCO-EQ": "Nifty 50",
    "NSE:ADANIENT-EQ": "Nifty 50",
    "NSE:JSWSTEEL-EQ": "Nifty 50",
    "NSE:HINDALCO-EQ": "Nifty 50",
    "NSE:TATASTEEL-EQ": "Nifty 50",
    "NSE:LT-EQ": "Nifty 50",
    "NSE:BEL-EQ": "Nifty 50",
    "NSE:ADANIPORTS-EQ": "Nifty 50",
    "NSE:BHARTIARTL-EQ": "Nifty 50",
    "NSE:TITAN-EQ": "Nifty 50",
    "NSE:ASIANPAINT-EQ": "Nifty 50",
    "NSE:INDIGO-EQ": "Nifty 50",
    "NSE:TRENT-EQ": "Nifty 50",
    "NSE:GRASIM-EQ": "Nifty 50",
    "NSE:APOLLOHOSP-EQ": "Nifty 50",
    # Bank
    "NSE:FEDERALBNK-EQ": "Bank",
    "NSE:AUBANK-EQ": "Bank",
    "NSE:IDFCFIRSTB-EQ": "Bank",
    "NSE:INDUSINDBK-EQ": "Bank",
    "NSE:PNB-EQ": "Bank",
    "NSE:CANBK-EQ": "Bank",
    "NSE:UNIONBANK-EQ": "Bank",
    "NSE:BANKBARODA-EQ": "Bank",
    "NSE:YESBANK-EQ": "Bank",
    # Pvt Bank
    "NSE:BANDHANBNK-EQ": "Pvt Bank",
    "NSE:RBLBANK-EQ": "Pvt Bank",
    # Psu Bank
    "NSE:INDIANB-EQ": "Psu Bank",
    "NSE:BANKINDIA-EQ": "Psu Bank",
    # Fin Service
    "NSE:HDFCAMC-EQ": "Fin Service",
    "NSE:RECLTD-EQ": "Fin Service",
    "NSE:LICHSGFIN-EQ": "Fin Service",
    "NSE:IRFC-EQ": "Fin Service",
    "NSE:PNBHOUSING-EQ": "Fin Service",
    "NSE:MUTHOOTFIN-EQ": "Fin Service",
    "NSE:SBICARD-EQ": "Fin Service",
    "NSE:PFC-EQ": "Fin Service",
    "NSE:CHOLAFIN-EQ": "Fin Service",
    "NSE:ICICIPRULI-EQ": "Fin Service",
    "NSE:ICICIGI-EQ": "Fin Service",
    "NSE:LICI-EQ": "Fin Service",
    "NSE:ANGELONE-EQ": "Fin Service",
    "NSE:BSE-EQ": "Fin Service",
    "NSE:POLICYBZR-EQ": "Fin Service",
    "NSE:CDSL-EQ": "Fin Service",
    "NSE:NUVAMA-EQ": "Fin Service",
    "NSE:PAYTM-EQ": "Fin Service",
    "NSE:MCX-EQ": "Fin Service",
    "NSE:IEX-EQ": "Fin Service",
    "NSE:360ONE-EQ": "Fin Service",  # 360 ONE WAM, formerly IIFL Wealth
    "NSE:MOTILALOFS-EQ": "Fin Service",
    "NSE:LTF-EQ": "Fin Service",
    "NSE:MFSL-EQ": "Fin Service",
    "NSE:ABCAPITAL-EQ": "Fin Service",
    "NSE:MANAPPURAM-EQ": "Fin Service",
    "NSE:BAJAJHLDNG-EQ": "Fin Service",  # holding company, not an operating NBFC
    "NSE:KFINTECH-EQ": "Fin Service",
    # It
    "NSE:PERSISTENT-EQ": "It",
    "NSE:MPHASIS-EQ": "It",
    "NSE:COFORGE-EQ": "It",
    "NSE:KPITTECH-EQ": "It",
    "NSE:CAMS-EQ": "It",
    "NSE:OFSS-EQ": "It",
    "NSE:TATAELXSI-EQ": "It",
    "NSE:LTM-EQ": "It",  # LTIMindtree renamed its own ticker from LTIM to LTM
    "NSE:KAYNES-EQ": "It",
    "NSE:NAUKRI-EQ": "It",
    # Auto
    "NSE:ASHOKLEY-EQ": "Auto",
    "NSE:TIINDIA-EQ": "Auto",
    "NSE:MOTHERSON-EQ": "Auto",
    "NSE:HEROMOTOCO-EQ": "Auto",
    "NSE:EXIDEIND-EQ": "Auto",
    "NSE:SONACOMS-EQ": "Auto",
    "NSE:BOSCHLTD-EQ": "Auto",
    "NSE:BHARATFORG-EQ": "Auto",
    "NSE:UNOMINDA-EQ": "Auto",
    "NSE:TVSMOTOR-EQ": "Auto",
    "NSE:FORCEMOT-EQ": "Auto",
    "NSE:HYUNDAI-EQ": "Auto",
    # Pharma
    "NSE:LAURUSLABS-EQ": "Pharma",
    "NSE:DIVISLAB-EQ": "Pharma",
    "NSE:GLENMARK-EQ": "Pharma",
    "NSE:TORNTPHARM-EQ": "Pharma",
    "NSE:BIOCON-EQ": "Pharma",
    "NSE:MANKIND-EQ": "Pharma",
    "NSE:ZYDUSLIFE-EQ": "Pharma",
    "NSE:ALKEM-EQ": "Pharma",
    "NSE:FORTIS-EQ": "Pharma",
    # Fmcg
    "NSE:GODREJCP-EQ": "Fmcg",
    "NSE:COLPAL-EQ": "Fmcg",
    "NSE:VBL-EQ": "Fmcg",
    "NSE:BRITANNIA-EQ": "Fmcg",
    "NSE:SUPREMEIND-EQ": "Fmcg",
    "NSE:MARICO-EQ": "Fmcg",
    "NSE:DABUR-EQ": "Fmcg",
    "NSE:UNITDSPR-EQ": "Fmcg",  # United Spirits (aka McDowell's)
    "NSE:DMART-EQ": "Fmcg",
    "NSE:KALYANKJIL-EQ": "Fmcg",
    "NSE:PATANJALI-EQ": "Fmcg",
    "NSE:NYKAA-EQ": "Fmcg",
    "NSE:VMM-EQ": "Fmcg",  # Vishal Mega Mart
    "NSE:GODFRYPHLP-EQ": "Fmcg",
    "NSE:RADICO-EQ": "Fmcg",
    "NSE:SWIGGY-EQ": "Fmcg",
    # Energy
    "NSE:OIL-EQ": "Energy",
    "NSE:PETRONET-EQ": "Energy",
    "NSE:IOC-EQ": "Energy",
    "NSE:HINDPETRO-EQ": "Energy",
    "NSE:JSWENERGY-EQ": "Energy",
    "NSE:ADANIENSOL-EQ": "Energy",
    "NSE:IREDA-EQ": "Energy",
    "NSE:ADANIGREEN-EQ": "Energy",
    "NSE:NHPC-EQ": "Energy",
    "NSE:TATAPOWER-EQ": "Energy",
    "NSE:SUZLON-EQ": "Energy",
    "NSE:INOXWIND-EQ": "Energy",
    "NSE:PREMIERENE-EQ": "Energy",
    "NSE:SOLARINDS-EQ": "Energy",
    "NSE:CGPOWER-EQ": "Energy",
    "NSE:POWERINDIA-EQ": "Energy",
    "NSE:BDL-EQ": "Energy",
    "NSE:MAZDOCK-EQ": "Energy",
    "NSE:BLUESTARCO-EQ": "Energy",
    "NSE:GMRAIRPORT-EQ": "Energy",
    "NSE:GAIL-EQ": "Energy",
    "NSE:BPCL-EQ": "Energy",
    "NSE:ADANIPOWER-EQ": "Energy",
    "NSE:SIEMENS-EQ": "Energy",
    "NSE:ABB-EQ": "Energy",
    "NSE:BHEL-EQ": "Energy",
    "NSE:GVT&D-EQ": "Energy",  # GE Vernova T&D India
    "NSE:WAAREEENER-EQ": "Energy",
    # Metal
    "NSE:NATIONALUM-EQ": "Metal",
    "NSE:NMDC-EQ": "Metal",
    "NSE:APLAPOLLO-EQ": "Metal",
    "NSE:JINDALSTEL-EQ": "Metal",
    "NSE:SAIL-EQ": "Metal",
    "NSE:VEDL-EQ": "Metal",
    "NSE:HINDZINC-EQ": "Metal",
    # Realty
    "NSE:LODHA-EQ": "Realty",
    "NSE:PRESTIGE-EQ": "Realty",
    "NSE:DLF-EQ": "Realty",
    "NSE:NBCC-EQ": "Realty",
    "NSE:OBEROIRLTY-EQ": "Realty",
    "NSE:PHOENIXLTD-EQ": "Realty",
    # Cement
    "NSE:SHREECEM-EQ": "Cement",
    "NSE:DALBHARAT-EQ": "Cement",
    "NSE:AMBUJACEM-EQ": "Cement",
    # Midcap Select
    "NSE:CUMMINSIND-EQ": "Midcap Select",
    "NSE:ASTRAL-EQ": "Midcap Select",
    "NSE:VOLTAS-EQ": "Midcap Select",
    "NSE:CONCOR-EQ": "Midcap Select",
    "NSE:RVNL-EQ": "Midcap Select",
    "NSE:GODREJPROP-EQ": "Midcap Select",
    "NSE:LUPIN-EQ": "Midcap Select",
    "NSE:AUROPHARMA-EQ": "Midcap Select",
    "NSE:UPL-EQ": "Midcap Select",
    "NSE:PIIND-EQ": "Midcap Select",
    "NSE:JUBLFOOD-EQ": "Midcap Select",
    "NSE:INDHOTEL-EQ": "Midcap Select",
    "NSE:PAGEIND-EQ": "Midcap Select",
    "NSE:POLYCAB-EQ": "Midcap Select",
    # Others
    "NSE:HAL-EQ": "Others",
    "NSE:IDEA-EQ": "Others",
    "NSE:INDUSTOWER-EQ": "Others",
    "NSE:DIXON-EQ": "Others",
    "NSE:HAVELLS-EQ": "Others",
    "NSE:CROMPTON-EQ": "Others",
    "NSE:SRF-EQ": "Others",
    "NSE:NAM-INDIA-EQ": "Others",  # Nippon Life India Asset Management
    "NSE:COCHINSHIP-EQ": "Others",
    "NSE:KEI-EQ": "Others",
    "NSE:DELHIVERY-EQ": "Others",
    "NSE:AMBER-EQ": "Others",
    "NSE:PGEL-EQ": "Others",  # PG Electroplast
    "NSE:PIDILITIND-EQ": "Others",  # correct ticker — not "PIDILITE"
}


# Fine-grained industry sector per short symbol (pre-2026-08-06 taxonomy),
# kept ONLY for momentum_score.py's RS-vs-sector calculation — WATCHLIST's
# sector values above now match a friend's separately-built tool's display
# taxonomy (Nifty 50 / Bank / Fin Service / etc.), which is too coarse for
# scoring (e.g. lumps capital goods, auto ancillaries and NBFCs together
# under one giant "Energy"/"Nifty 50" bucket). Scoring keeps using this
# finer breakdown instead so RS-vs-sector doesn't get diluted.
INDUSTRY_GROUP = {
    # Energy
    "BPCL": "Energy",
    "COALINDIA": "Energy",
    "GAIL": "Energy",
    "HINDPETRO": "Energy",
    "IOC": "Energy",
    "OIL": "Energy",
    "ONGC": "Energy",
    "PETRONET": "Energy",
    "RELIANCE": "Energy",
    # Power
    "ADANIENSOL": "Power",
    "ADANIGREEN": "Power",
    "ADANIPOWER": "Power",
    "INOXWIND": "Power",
    "IREDA": "Power",
    "JSWENERGY": "Power",
    "NHPC": "Power",
    "NTPC": "Power",
    "POWERGRID": "Power",
    "PREMIERENE": "Power",
    "SUZLON": "Power",
    "TATAPOWER": "Power",
    "WAAREEENER": "Power",
    # Capital Goods
    "ABB": "Capital Goods",
    "ASTRAL": "Capital Goods",
    "BDL": "Capital Goods",
    "BEL": "Capital Goods",
    "BHEL": "Capital Goods",
    "CGPOWER": "Capital Goods",
    "COCHINSHIP": "Capital Goods",
    "CUMMINSIND": "Capital Goods",
    "GVT&D": "Capital Goods",
    "HAL": "Capital Goods",
    "KEI": "Capital Goods",
    "LT": "Capital Goods",
    "MAZDOCK": "Capital Goods",
    "POLYCAB": "Capital Goods",
    "POWERINDIA": "Capital Goods",
    "SIEMENS": "Capital Goods",
    "SOLARINDS": "Capital Goods",
    # Consumer Durables
    "AMBER": "Consumer Durables",
    "BLUESTARCO": "Consumer Durables",
    "CROMPTON": "Consumer Durables",
    "DIXON": "Consumer Durables",
    "HAVELLS": "Consumer Durables",
    "PGEL": "Consumer Durables",
    "TITAN": "Consumer Durables",
    "VOLTAS": "Consumer Durables",
    # Infra
    "ADANIPORTS": "Infra",
    "CONCOR": "Infra",
    "DELHIVERY": "Infra",
    "GMRAIRPORT": "Infra",
    "RVNL": "Infra",
    # Auto
    "ASHOKLEY": "Auto",
    "BAJAJ-AUTO": "Auto",
    "BHARATFORG": "Auto",
    "BOSCHLTD": "Auto",
    "EICHERMOT": "Auto",
    "EXIDEIND": "Auto",
    "FORCEMOT": "Auto",
    "HEROMOTOCO": "Auto",
    "HYUNDAI": "Auto",
    "M&M": "Auto",
    "MARUTI": "Auto",
    "MOTHERSON": "Auto",
    "SONACOMS": "Auto",
    "TIINDIA": "Auto",
    "TMPV": "Auto",
    "TVSMOTOR": "Auto",
    "UNOMINDA": "Auto",
    # Pvt Banks
    "AUBANK": "Pvt Banks",
    "AXISBANK": "Pvt Banks",
    "BANDHANBNK": "Pvt Banks",
    "FEDERALBNK": "Pvt Banks",
    "HDFCBANK": "Pvt Banks",
    "ICICIBANK": "Pvt Banks",
    "IDFCFIRSTB": "Pvt Banks",
    "INDUSINDBK": "Pvt Banks",
    "KOTAKBANK": "Pvt Banks",
    "RBLBANK": "Pvt Banks",
    "YESBANK": "Pvt Banks",
    # PSU Banks
    "BANKBARODA": "PSU Banks",
    "BANKINDIA": "PSU Banks",
    "CANBK": "PSU Banks",
    "INDIANB": "PSU Banks",
    "PNB": "PSU Banks",
    "SBIN": "PSU Banks",
    "UNIONBANK": "PSU Banks",
    # NBFC
    "ABCAPITAL": "NBFC",
    "BAJAJFINSV": "NBFC",
    "BAJFINANCE": "NBFC",
    "CHOLAFIN": "NBFC",
    "HDFCAMC": "NBFC",
    "IRFC": "NBFC",
    "JIOFIN": "NBFC",
    "LICHSGFIN": "NBFC",
    "LTF": "NBFC",
    "MANAPPURAM": "NBFC",
    "MFSL": "NBFC",
    "MUTHOOTFIN": "NBFC",
    "PFC": "NBFC",
    "PNBHOUSING": "NBFC",
    "RECLTD": "NBFC",
    "SBICARD": "NBFC",
    "SHRIRAMFIN": "NBFC",
    # Insurance
    "HDFCLIFE": "Insurance",
    "ICICIGI": "Insurance",
    "ICICIPRULI": "Insurance",
    "LICI": "Insurance",
    "SBILIFE": "Insurance",
    # Capital Markets
    "360ONE": "Capital Markets",
    "ANGELONE": "Capital Markets",
    "BSE": "Capital Markets",
    "CDSL": "Capital Markets",
    "IEX": "Capital Markets",
    "MCX": "Capital Markets",
    "MOTILALOFS": "Capital Markets",
    "NAM-INDIA": "Capital Markets",
    "NAUKRI": "Capital Markets",
    "NUVAMA": "Capital Markets",
    "PAYTM": "Capital Markets",
    "POLICYBZR": "Capital Markets",
    # Healthcare
    "APOLLOHOSP": "Healthcare",
    "MAXHEALTH": "Healthcare",
    # Realty
    "DLF": "Realty",
    "GODREJPROP": "Realty",
    "LODHA": "Realty",
    "NBCC": "Realty",
    "OBEROIRLTY": "Realty",
    "PHOENIXLTD": "Realty",
    "PRESTIGE": "Realty",
    # IT
    "CAMS": "IT",
    "COFORGE": "IT",
    "HCLTECH": "IT",
    "INFY": "IT",
    "KAYNES": "IT",
    "KFINTECH": "IT",
    "KPITTECH": "IT",
    "LTM": "IT",
    "MPHASIS": "IT",
    "OFSS": "IT",
    "PERSISTENT": "IT",
    "TATAELXSI": "IT",
    "TCS": "IT",
    "TECHM": "IT",
    "WIPRO": "IT",
    # Pharma
    "ALKEM": "Pharma",
    "AUROPHARMA": "Pharma",
    "BIOCON": "Pharma",
    "CIPLA": "Pharma",
    "DIVISLAB": "Pharma",
    "DRREDDY": "Pharma",
    "FORTIS": "Pharma",
    "GLENMARK": "Pharma",
    "LAURUSLABS": "Pharma",
    "LUPIN": "Pharma",
    "MANKIND": "Pharma",
    "SUNPHARMA": "Pharma",
    "TORNTPHARM": "Pharma",
    "ZYDUSLIFE": "Pharma",
    # Chemicals
    "PIDILITIND": "Chemicals",
    "PIIND": "Chemicals",
    "SRF": "Chemicals",
    "UPL": "Chemicals",
    # Consumer
    "INDHOTEL": "Consumer",
    "JUBLFOOD": "Consumer",
    "PAGEIND": "Consumer",
    # FMCG
    "ASIANPAINT": "FMCG",
    "BRITANNIA": "FMCG",
    "COLPAL": "FMCG",
    "DABUR": "FMCG",
    "DMART": "FMCG",
    "ETERNAL": "FMCG",
    "GODFRYPHLP": "FMCG",
    "GODREJCP": "FMCG",
    "HINDUNILVR": "FMCG",
    "ITC": "FMCG",
    "KALYANKJIL": "FMCG",
    "MARICO": "FMCG",
    "NESTLEIND": "FMCG",
    "NYKAA": "FMCG",
    "PATANJALI": "FMCG",
    "RADICO": "FMCG",
    "SUPREMEIND": "FMCG",
    "SWIGGY": "FMCG",
    "TATACONSUM": "FMCG",
    "UNITDSPR": "FMCG",
    "VBL": "FMCG",
    # Cement
    "AMBUJACEM": "Cement",
    "DALBHARAT": "Cement",
    "SHREECEM": "Cement",
    "ULTRACEMCO": "Cement",
    # Metals
    "ADANIENT": "Metals",
    "APLAPOLLO": "Metals",
    "HINDALCO": "Metals",
    "HINDZINC": "Metals",
    "JINDALSTEL": "Metals",
    "JSWSTEEL": "Metals",
    "NATIONALUM": "Metals",
    "NMDC": "Metals",
    "SAIL": "Metals",
    "TATASTEEL": "Metals",
    "VEDL": "Metals",
    # Telecom
    "BHARTIARTL": "Telecom",
    "IDEA": "Telecom",
    "INDUSTOWER": "Telecom",
    # Aviation
    "INDIGO": "Aviation",
    # Retail
    "TRENT": "Retail",
    "VMM": "Retail",
    # Diversified
    "BAJAJHLDNG": "Diversified",
    "GRASIM": "Diversified",
}


def short_symbol(fyers_symbol: str) -> str:
    """`NSE:TCS-EQ` -> `TCS`, `NSE:NIFTY50-INDEX` -> `NIFTY50`."""
    core = fyers_symbol.split(":", 1)[-1]
    for suffix in ("-EQ", "-INDEX"):
        if core.endswith(suffix):
            return core[: -len(suffix)]
    return core


ALL_SYMBOLS = [BENCHMARK_SYMBOL] + list(WATCHLIST.keys())
