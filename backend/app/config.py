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

# ----------------- Broker Selection -----------------
BROKER = os.getenv("BROKER", "aliceblue").strip().lower()

# ----------------- Alice Blue credentials -----------------
ALICEBLUE_USER_ID = os.getenv("ALICEBLUE_USER_ID", "2628887").strip()
ALICEBLUE_PASSWORD = os.getenv("ALICEBLUE_PASSWORD", "Thalamsd&7781").strip()
ALICEBLUE_TOTP_KEY = (
    os.getenv("ALICEBLUE_TOTP_KEY", "NDAWXZFBTOUJKUBDGOSJMJBYZKFYGPDR").replace(" ", "").strip()
)
ALICEBLUE_APP_KEY = os.getenv(
    "ALICEBLUE_APP_KEY", os.getenv("ALICEBLUE_APP_CODE", "X926u86ZC6")
).strip()
ALICEBLUE_APP_CODE = ALICEBLUE_APP_KEY
ALICEBLUE_API_SECRET = os.getenv(
    "ALICEBLUE_API_SECRET",
    os.getenv(
        "ALICEBLUE_API_KEY",
        "0su1gFNZfoHtLMWOKpES8TudTfzM2SYVB4gKxpBPkSTw7bHEW2GTbB78LsUE1bRnlyz4OeGgohtkeHk9qFN5o0QMmvyQax2sEirx",
    ),
).strip()
ALICEBLUE_API_KEY = ALICEBLUE_API_SECRET
ALICEBLUE_SESSION_TOKEN = os.getenv("ALICEBLUE_SESSION_TOKEN", "").strip()

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
STREAM_INTERVAL = float(os.getenv("STREAM_INTERVAL", "0.10"))
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

# ----------------- Conviction Scorer — weighted signal quality -----------------
# Replaces the old binary 4-tier gatekeeper that required all gates to pass
# simultaneously (conjunction paralysis). Each factor now contributes weighted
# points to a 0-100 composite score; a single threshold decides admission.
#
# MIN_RS_THRESHOLD: Reference threshold for RS scoring (graduated, not binary).
#   Used as the midpoint: RS at this level scores ~50% of the RS weight;
#   RS at 2x this level scores full weight.  Still env-configurable.
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
#   score >= this value.  85 is high — filters out ambiguous setups and requires clean structure.
MIN_AI_CONFIDENCE = int(os.getenv("MIN_AI_CONFIDENCE", "85"))
#
# PulseHunter V2 Dual-Score Thresholds (0-100 scale)
# MIN_MOMENTUM_SCORE: Measures whether the stock is inherently exhibiting elite momentum (RS + Volume + Velocity).
MIN_MOMENTUM_SCORE = int(os.getenv("MIN_MOMENTUM_SCORE", "62"))
# MIN_ENTRY_QUALITY_SCORE: Measures whether the entry location is fresh vs. an extended chase.
MIN_ENTRY_QUALITY_SCORE = int(os.getenv("MIN_ENTRY_QUALITY_SCORE", "65"))
# Minimum combined conviction score (weighted average of EQ 55% + Mom 45%)
MIN_COMPOSITE_CONVICTION = int(os.getenv("MIN_COMPOSITE_CONVICTION", "68"))
# Elite AI Gate Filter: Only ORB signals scoring >= this score query Gemini (max 3-5 AI audits/day)
MIN_ELITE_ORB_AI_SCORE = int(os.getenv("MIN_ELITE_ORB_AI_SCORE", "80"))
# Non-blocking fallback floor: if Gemini times out or hits 429, execute autonomously if score >= this floor
MIN_FALLBACK_CONVICTION = int(os.getenv("MIN_FALLBACK_CONVICTION", "70"))
# Legacy alias for backwards compatibility
MIN_CONVICTION_SCORE = MIN_MOMENTUM_SCORE

# ----------------- Auto paper trade execution & Signal Caps -----------------
# DAILY_MAX_RISK_INR: Maximum total risk (capital at stake) across ALL auto
#   paper trades in a single trading day.  ₹3,400 = total stop loss budget.
DAILY_MAX_RISK_INR = float(os.getenv("DAILY_MAX_RISK_INR", "5000.0"))
MAX_RISK_PER_TRADE = float(os.getenv("MAX_RISK_PER_TRADE", "1000.0"))
MAX_MARGIN_PER_TRADE = float(os.getenv("MAX_MARGIN_PER_TRADE", "10000.0"))

STRATEGY_STATES = {
    "ORB_BREAKOUT": "RUNNING",
    "VWAP_RETEST": "RUNNING",
    "OI_SQUEEZE": "RUNNING",
    "SECTOR_SYMPATHY": "RUNNING",
    "MOMENTUM_RUNNER": "RUNNING",
}
#
# MAX_DAILY_AUTO_TRADES: Hard cap on the number of auto paper trades per day (configurable via env).
#   Risk per trade is dynamically allocated per strategy family via RiskAllocator.
MAX_DAILY_AUTO_TRADES = int(os.getenv("MAX_DAILY_AUTO_TRADES", "5"))
#
# MAX_DAILY_MANUAL_ALERTS: Hard cap on manual approval Telegram alerts per day (4 total across strategies).
MAX_DAILY_MANUAL_ALERTS = int(os.getenv("MAX_DAILY_MANUAL_ALERTS", "4"))
# Minimum Notional Floor: ensures position turnover profits easily exceed statutory exchange costs
MIN_ORDER_NOTIONAL_INR = float(os.getenv("MIN_ORDER_NOTIONAL_INR", "30000.0"))
#
# Execution & Scanning Cutoffs (Session minute 0 = 09:15 AM):
#   ORB_EXECUTE_UNTIL_MINUTE (90 = 10:45 AM): Extended cutoff for prime breakout entries.
#   RECLAIM_EXECUTE_UNTIL_MINUTE (105 = 11:00 AM): Cutoff for Type-B VWAP reclaim / retest setups.
#   MARKET_SCAN_END_MINUTE (105 = 11:00 AM): Hard engine cutoff after which ALL signal scanning halts.
ORB_EXECUTE_UNTIL_MINUTE = int(os.getenv("ORB_EXECUTE_UNTIL_MINUTE", "90"))
RECLAIM_EXECUTE_UNTIL_MINUTE = int(os.getenv("RECLAIM_EXECUTE_UNTIL_MINUTE", "105"))
MARKET_SCAN_END_MINUTE = int(os.getenv("MARKET_SCAN_END_MINUTE", "105"))
AUTO_EXECUTE_UNTIL_MINUTE = int(
    os.getenv("AUTO_EXECUTE_UNTIL_MINUTE", str(ORB_EXECUTE_UNTIL_MINUTE))
)
#
# AUTO_PAPER_USER_ID: The user_id (from auth.users) under which auto paper
#   trades are placed. Must match a valid user in the Supabase auth table.
#   Leave empty to disable auto-execution even when all other gates pass.
AUTO_PAPER_USER_ID = os.getenv("AUTO_PAPER_USER_ID", "")

# ----------------- Multi-Strategy & Risk Allocation -----------------
ENABLE_RISK_ALLOCATOR = os.getenv("ENABLE_RISK_ALLOCATOR", "true").lower() in ("true", "1", "yes")
ENABLE_MULTI_STRATEGY_DEDUP = os.getenv("ENABLE_MULTI_STRATEGY_DEDUP", "true").lower() in (
    "true",
    "1",
    "yes",
)
ORB_BUDGET_TRADES = int(os.getenv("ORB_BUDGET_TRADES", "1"))
ORB_BUDGET_RISK = float(os.getenv("ORB_BUDGET_RISK", "1000.0"))
VWAP_BUDGET_TRADES = int(os.getenv("VWAP_BUDGET_TRADES", "1"))
VWAP_BUDGET_RISK = float(os.getenv("VWAP_BUDGET_RISK", "1000.0"))
SECTOR_BUDGET_TRADES = int(os.getenv("SECTOR_BUDGET_TRADES", "1"))
SECTOR_BUDGET_RISK = float(os.getenv("SECTOR_BUDGET_RISK", "1000.0"))
SQUEEZE_BUDGET_TRADES = int(os.getenv("SQUEEZE_BUDGET_TRADES", "1"))
SQUEEZE_BUDGET_RISK = float(os.getenv("SQUEEZE_BUDGET_RISK", "1000.0"))
MAX_MANUAL_ALERTS_PER_STRATEGY = int(os.getenv("MAX_MANUAL_ALERTS_PER_STRATEGY", "3"))


# ----------------- Token cache & refresh -----------------
# Location where the daily access token is cached (env-configurable → mount a volume when hosted).
TOKEN_CACHE_FILE = os.getenv(
    "TOKEN_CACHE_FILE",
    os.path.join(os.path.dirname(__file__), "..", ".token_cache.json"),
)
ALICEBLUE_TOKEN_CACHE_FILE = os.getenv(
    "ALICEBLUE_TOKEN_CACHE_FILE",
    os.path.join(os.path.dirname(__file__), "..", "data", "aliceblue_token.json"),
)
FYERS_REFRESH_URL = os.getenv(
    "FYERS_REFRESH_URL", "https://api-t1.fyers.in/api/v3/validate-refresh-token"
)

# ----------------- Session timings (IST) -----------------
MARKET_OPEN = dt_time(9, 15)
MARKET_CLOSE = dt_time(15, 30)
DAILY_LOGIN_TIME = dt_time(8, 45)  # cron trigger for the fresh daily token

# Opening Range Breakout candles: (name, start, end)
# C0.5 is a 15-minute early-fire window that catches the 09:18-09:30
# institutional expansion wave before the full C1 range completes.
# C0.5 and C1 overlap (both start at 09:15); candle_aggregator tracks
# both simultaneously.  C0.5 breakout fires at 09:30; C1 at 09:45.
ORB_CANDLES = [
    ("C0.5", dt_time(9, 15), dt_time(9, 30)),
    ("C1", dt_time(9, 15), dt_time(9, 45)),
    ("C2", dt_time(9, 45), dt_time(10, 15)),
    ("C3", dt_time(10, 15), dt_time(10, 45)),
    ("C4", dt_time(10, 45), dt_time(11, 15)),
]

BENCHMARK_SYMBOL = "NSE:NIFTY50-INDEX"

# ----------------- Watchlist (11 Official NSE Sector Groups) -----------------
# Fyers symbol format: "NSE:<TICKER>-EQ".
# Classified into the 11 Official NSE Sector Groups:
# Automobile, Banking & Finance, Cement & Chemicals, Consumer Discretionary,
# Energy & Power, FMCG & Staples, Information Technology, Infra & Capital Goods,
# Metals & Mining, Pharma & Healthcare, Real Estate.
WATCHLIST = {
    # Automobile (17 stocks)
    "NSE:ASHOKLEY-EQ": "Automobile",
    "NSE:BAJAJ-AUTO-EQ": "Automobile",
    "NSE:BHARATFORG-EQ": "Automobile",
    "NSE:BOSCHLTD-EQ": "Automobile",
    "NSE:EICHERMOT-EQ": "Automobile",
    "NSE:EXIDEIND-EQ": "Automobile",
    "NSE:FORCEMOT-EQ": "Automobile",
    "NSE:HEROMOTOCO-EQ": "Automobile",
    "NSE:HYUNDAI-EQ": "Automobile",
    "NSE:M&M-EQ": "Automobile",
    "NSE:MARUTI-EQ": "Automobile",
    "NSE:MOTHERSON-EQ": "Automobile",
    "NSE:SONACOMS-EQ": "Automobile",
    "NSE:TIINDIA-EQ": "Automobile",
    "NSE:TMPV-EQ": "Automobile",
    "NSE:TVSMOTOR-EQ": "Automobile",
    "NSE:UNOMINDA-EQ": "Automobile",
    # Banking & Finance (53 stocks)
    "NSE:360ONE-EQ": "Banking & Finance",
    "NSE:ABCAPITAL-EQ": "Banking & Finance",
    "NSE:ANGELONE-EQ": "Banking & Finance",
    "NSE:AUBANK-EQ": "Banking & Finance",
    "NSE:AXISBANK-EQ": "Banking & Finance",
    "NSE:BAJAJFINSV-EQ": "Banking & Finance",
    "NSE:BAJAJHLDNG-EQ": "Banking & Finance",
    "NSE:BAJFINANCE-EQ": "Banking & Finance",
    "NSE:BANDHANBNK-EQ": "Banking & Finance",
    "NSE:BANKBARODA-EQ": "Banking & Finance",
    "NSE:BANKINDIA-EQ": "Banking & Finance",
    "NSE:BSE-EQ": "Banking & Finance",
    "NSE:CANBK-EQ": "Banking & Finance",
    "NSE:CDSL-EQ": "Banking & Finance",
    "NSE:CHOLAFIN-EQ": "Banking & Finance",
    "NSE:FEDERALBNK-EQ": "Banking & Finance",
    "NSE:HDFCAMC-EQ": "Banking & Finance",
    "NSE:HDFCBANK-EQ": "Banking & Finance",
    "NSE:HDFCLIFE-EQ": "Banking & Finance",
    "NSE:ICICIBANK-EQ": "Banking & Finance",
    "NSE:ICICIGI-EQ": "Banking & Finance",
    "NSE:ICICIPRULI-EQ": "Banking & Finance",
    "NSE:IDFCFIRSTB-EQ": "Banking & Finance",
    "NSE:IEX-EQ": "Banking & Finance",
    "NSE:INDIANB-EQ": "Banking & Finance",
    "NSE:INDUSINDBK-EQ": "Banking & Finance",
    "NSE:IRFC-EQ": "Banking & Finance",
    "NSE:JIOFIN-EQ": "Banking & Finance",
    "NSE:KOTAKBANK-EQ": "Banking & Finance",
    "NSE:LICHSGFIN-EQ": "Banking & Finance",
    "NSE:LICI-EQ": "Banking & Finance",
    "NSE:LTF-EQ": "Banking & Finance",
    "NSE:MANAPPURAM-EQ": "Banking & Finance",
    "NSE:MCX-EQ": "Banking & Finance",
    "NSE:MFSL-EQ": "Banking & Finance",
    "NSE:MOTILALOFS-EQ": "Banking & Finance",
    "NSE:MUTHOOTFIN-EQ": "Banking & Finance",
    "NSE:NAM-INDIA-EQ": "Banking & Finance",
    "NSE:NAUKRI-EQ": "Banking & Finance",
    "NSE:NUVAMA-EQ": "Banking & Finance",
    "NSE:PAYTM-EQ": "Banking & Finance",
    "NSE:PFC-EQ": "Banking & Finance",
    "NSE:PNB-EQ": "Banking & Finance",
    "NSE:PNBHOUSING-EQ": "Banking & Finance",
    "NSE:POLICYBZR-EQ": "Banking & Finance",
    "NSE:RBLBANK-EQ": "Banking & Finance",
    "NSE:RECLTD-EQ": "Banking & Finance",
    "NSE:SBICARD-EQ": "Banking & Finance",
    "NSE:SBILIFE-EQ": "Banking & Finance",
    "NSE:SBIN-EQ": "Banking & Finance",
    "NSE:SHRIRAMFIN-EQ": "Banking & Finance",
    "NSE:UNIONBANK-EQ": "Banking & Finance",
    "NSE:YESBANK-EQ": "Banking & Finance",
    # Cement & Chemicals (9 stocks)
    "NSE:AMBUJACEM-EQ": "Cement & Chemicals",
    "NSE:DALBHARAT-EQ": "Cement & Chemicals",
    "NSE:GRASIM-EQ": "Cement & Chemicals",
    "NSE:PIDILITIND-EQ": "Cement & Chemicals",
    "NSE:PIIND-EQ": "Cement & Chemicals",
    "NSE:SHREECEM-EQ": "Cement & Chemicals",
    "NSE:SRF-EQ": "Cement & Chemicals",
    "NSE:ULTRACEMCO-EQ": "Cement & Chemicals",
    "NSE:UPL-EQ": "Cement & Chemicals",
    # Consumer Discretionary (13 stocks)
    "NSE:AMBER-EQ": "Consumer Discretionary",
    "NSE:BLUESTARCO-EQ": "Consumer Discretionary",
    "NSE:CROMPTON-EQ": "Consumer Discretionary",
    "NSE:DIXON-EQ": "Consumer Discretionary",
    "NSE:HAVELLS-EQ": "Consumer Discretionary",
    "NSE:INDHOTEL-EQ": "Consumer Discretionary",
    "NSE:JUBLFOOD-EQ": "Consumer Discretionary",
    "NSE:PAGEIND-EQ": "Consumer Discretionary",
    "NSE:PGEL-EQ": "Consumer Discretionary",
    "NSE:TITAN-EQ": "Consumer Discretionary",
    "NSE:TRENT-EQ": "Consumer Discretionary",
    "NSE:VMM-EQ": "Consumer Discretionary",
    "NSE:VOLTAS-EQ": "Consumer Discretionary",
    # Energy & Power (22 stocks)
    "NSE:ADANIENSOL-EQ": "Energy & Power",
    "NSE:ADANIGREEN-EQ": "Energy & Power",
    "NSE:ADANIPOWER-EQ": "Energy & Power",
    "NSE:BPCL-EQ": "Energy & Power",
    "NSE:COALINDIA-EQ": "Energy & Power",
    "NSE:GAIL-EQ": "Energy & Power",
    "NSE:HINDPETRO-EQ": "Energy & Power",
    "NSE:INOXWIND-EQ": "Energy & Power",
    "NSE:IOC-EQ": "Energy & Power",
    "NSE:IREDA-EQ": "Energy & Power",
    "NSE:JSWENERGY-EQ": "Energy & Power",
    "NSE:NHPC-EQ": "Energy & Power",
    "NSE:NTPC-EQ": "Energy & Power",
    "NSE:OIL-EQ": "Energy & Power",
    "NSE:ONGC-EQ": "Energy & Power",
    "NSE:PETRONET-EQ": "Energy & Power",
    "NSE:POWERGRID-EQ": "Energy & Power",
    "NSE:PREMIERENE-EQ": "Energy & Power",
    "NSE:RELIANCE-EQ": "Energy & Power",
    "NSE:SUZLON-EQ": "Energy & Power",
    "NSE:TATAPOWER-EQ": "Energy & Power",
    "NSE:WAAREEENER-EQ": "Energy & Power",
    # FMCG & Staples (21 stocks)
    "NSE:ASIANPAINT-EQ": "FMCG & Staples",
    "NSE:BRITANNIA-EQ": "FMCG & Staples",
    "NSE:COLPAL-EQ": "FMCG & Staples",
    "NSE:DABUR-EQ": "FMCG & Staples",
    "NSE:DMART-EQ": "FMCG & Staples",
    "NSE:ETERNAL-EQ": "FMCG & Staples",
    "NSE:GODFRYPHLP-EQ": "FMCG & Staples",
    "NSE:GODREJCP-EQ": "FMCG & Staples",
    "NSE:HINDUNILVR-EQ": "FMCG & Staples",
    "NSE:ITC-EQ": "FMCG & Staples",
    "NSE:KALYANKJIL-EQ": "FMCG & Staples",
    "NSE:MARICO-EQ": "FMCG & Staples",
    "NSE:NESTLEIND-EQ": "FMCG & Staples",
    "NSE:NYKAA-EQ": "FMCG & Staples",
    "NSE:PATANJALI-EQ": "FMCG & Staples",
    "NSE:RADICO-EQ": "FMCG & Staples",
    "NSE:SUPREMEIND-EQ": "FMCG & Staples",
    "NSE:SWIGGY-EQ": "FMCG & Staples",
    "NSE:TATACONSUM-EQ": "FMCG & Staples",
    "NSE:UNITDSPR-EQ": "FMCG & Staples",
    "NSE:VBL-EQ": "FMCG & Staples",
    # Information Technology (15 stocks)
    "NSE:CAMS-EQ": "Information Technology",
    "NSE:COFORGE-EQ": "Information Technology",
    "NSE:HCLTECH-EQ": "Information Technology",
    "NSE:INFY-EQ": "Information Technology",
    "NSE:KAYNES-EQ": "Information Technology",
    "NSE:KFINTECH-EQ": "Information Technology",
    "NSE:KPITTECH-EQ": "Information Technology",
    "NSE:LTM-EQ": "Information Technology",
    "NSE:MPHASIS-EQ": "Information Technology",
    "NSE:OFSS-EQ": "Information Technology",
    "NSE:PERSISTENT-EQ": "Information Technology",
    "NSE:TATAELXSI-EQ": "Information Technology",
    "NSE:TCS-EQ": "Information Technology",
    "NSE:TECHM-EQ": "Information Technology",
    "NSE:WIPRO-EQ": "Information Technology",
    # Infra & Capital Goods (26 stocks)
    "NSE:ABB-EQ": "Infra & Capital Goods",
    "NSE:ADANIPORTS-EQ": "Infra & Capital Goods",
    "NSE:ASTRAL-EQ": "Infra & Capital Goods",
    "NSE:BDL-EQ": "Infra & Capital Goods",
    "NSE:BEL-EQ": "Infra & Capital Goods",
    "NSE:BHARTIARTL-EQ": "Infra & Capital Goods",
    "NSE:BHEL-EQ": "Infra & Capital Goods",
    "NSE:CGPOWER-EQ": "Infra & Capital Goods",
    "NSE:COCHINSHIP-EQ": "Infra & Capital Goods",
    "NSE:CONCOR-EQ": "Infra & Capital Goods",
    "NSE:CUMMINSIND-EQ": "Infra & Capital Goods",
    "NSE:DELHIVERY-EQ": "Infra & Capital Goods",
    "NSE:GMRAIRPORT-EQ": "Infra & Capital Goods",
    "NSE:GVT&D-EQ": "Infra & Capital Goods",
    "NSE:HAL-EQ": "Infra & Capital Goods",
    "NSE:IDEA-EQ": "Infra & Capital Goods",
    "NSE:INDIGO-EQ": "Infra & Capital Goods",
    "NSE:INDUSTOWER-EQ": "Infra & Capital Goods",
    "NSE:KEI-EQ": "Infra & Capital Goods",
    "NSE:LT-EQ": "Infra & Capital Goods",
    "NSE:MAZDOCK-EQ": "Infra & Capital Goods",
    "NSE:POLYCAB-EQ": "Infra & Capital Goods",
    "NSE:POWERINDIA-EQ": "Infra & Capital Goods",
    "NSE:RVNL-EQ": "Infra & Capital Goods",
    "NSE:SIEMENS-EQ": "Infra & Capital Goods",
    "NSE:SOLARINDS-EQ": "Infra & Capital Goods",
    # Metals & Mining (11 stocks)
    "NSE:ADANIENT-EQ": "Metals & Mining",
    "NSE:APLAPOLLO-EQ": "Metals & Mining",
    "NSE:HINDALCO-EQ": "Metals & Mining",
    "NSE:HINDZINC-EQ": "Metals & Mining",
    "NSE:JINDALSTEL-EQ": "Metals & Mining",
    "NSE:JSWSTEEL-EQ": "Metals & Mining",
    "NSE:NATIONALUM-EQ": "Metals & Mining",
    "NSE:NMDC-EQ": "Metals & Mining",
    "NSE:SAIL-EQ": "Metals & Mining",
    "NSE:TATASTEEL-EQ": "Metals & Mining",
    "NSE:VEDL-EQ": "Metals & Mining",
    # Pharma & Healthcare (16 stocks)
    "NSE:ALKEM-EQ": "Pharma & Healthcare",
    "NSE:APOLLOHOSP-EQ": "Pharma & Healthcare",
    "NSE:AUROPHARMA-EQ": "Pharma & Healthcare",
    "NSE:BIOCON-EQ": "Pharma & Healthcare",
    "NSE:CIPLA-EQ": "Pharma & Healthcare",
    "NSE:DIVISLAB-EQ": "Pharma & Healthcare",
    "NSE:DRREDDY-EQ": "Pharma & Healthcare",
    "NSE:FORTIS-EQ": "Pharma & Healthcare",
    "NSE:GLENMARK-EQ": "Pharma & Healthcare",
    "NSE:LAURUSLABS-EQ": "Pharma & Healthcare",
    "NSE:LUPIN-EQ": "Pharma & Healthcare",
    "NSE:MANKIND-EQ": "Pharma & Healthcare",
    "NSE:MAXHEALTH-EQ": "Pharma & Healthcare",
    "NSE:SUNPHARMA-EQ": "Pharma & Healthcare",
    "NSE:TORNTPHARM-EQ": "Pharma & Healthcare",
    "NSE:ZYDUSLIFE-EQ": "Pharma & Healthcare",
    # Real Estate (7 stocks)
    "NSE:DLF-EQ": "Real Estate",
    "NSE:GODREJPROP-EQ": "Real Estate",
    "NSE:LODHA-EQ": "Real Estate",
    "NSE:NBCC-EQ": "Real Estate",
    "NSE:OBEROIRLTY-EQ": "Real Estate",
    "NSE:PHOENIXLTD-EQ": "Real Estate",
    "NSE:PRESTIGE-EQ": "Real Estate",
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
