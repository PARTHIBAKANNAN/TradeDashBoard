"""
Dynamic NSE F&O Synchronization Engine.

Periodically fetches the official NSE F&O market lots directory:
https://archives.nseindia.com/content/fo/fo_mktlots.csv
Detects additions and exclusions, assigns authentic sector classifications,
and soft-archives excluded symbols to maintain complete historical data integrity.
"""

import csv
import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

import requests

from .config import INDUSTRY_GROUP, IST, WATCHLIST, short_symbol

logger = logging.getLogger(__name__)

NSE_LOTS_CSV_URL = "https://archives.nseindia.com/content/fo/fo_mktlots.csv"
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
OVERRIDE_FILE = os.path.join(DATA_DIR, "dynamic_fno_universe.json")

# Exclude derivative indices — we only track underlying Cash Equities
INDEX_EXCLUSIONS = {
    "NIFTY",
    "BANKNIFTY",
    "FINNIFTY",
    "MIDCPNIFTY",
    "NIFTYNXT50",
    "NIFTYMID50",
    "INDIAVIX",
}

# Master 11-sector mapping table from fine-grained industry tags
FINE_TO_OFFICIAL_SECTOR = {
    "Pvt Banks": "Banking & Finance",
    "PSU Banks": "Banking & Finance",
    "NBFC": "Banking & Finance",
    "Insurance": "Banking & Finance",
    "Capital Markets": "Banking & Finance",
    "IT": "Information Technology",
    "Auto": "Automobile",
    "Metals": "Metals & Mining",
    "Energy": "Energy & Power",
    "Power": "Energy & Power",
    "Healthcare": "Pharma & Healthcare",
    "Pharma": "Pharma & Healthcare",
    "FMCG": "FMCG & Staples",
    "Consumer": "Consumer Discretionary",
    "Retail": "Consumer Discretionary",
    "Consumer Durables": "Consumer Discretionary",
    "Infra": "Infra & Capital Goods",
    "Capital Goods": "Infra & Capital Goods",
    "Telecom": "Infra & Capital Goods",
    "Aviation": "Infra & Capital Goods",
    "Realty": "Real Estate",
    "Cement": "Cement & Chemicals",
    "Chemicals": "Cement & Chemicals",
}

# Known initial taxonomy for high-profile emerging F&O entrants
KNOWN_NEW_ENTRANTS_TAXONOMY = {
    "ZOMATO": ("Consumer Discretionary", "Consumer"),
    "JIOFIN": ("Banking & Finance", "NBFC"),
    "DMART": ("FMCG & Staples", "FMCG"),
    "TRENT": ("Consumer Discretionary", "Retail"),
    "IREDA": ("Energy & Power", "Power"),
    "HUDCO": ("Banking & Finance", "NBFC"),
    "MOTILALOFS": ("Banking & Finance", "Capital Markets"),
    "ANGELONE": ("Banking & Finance", "Capital Markets"),
    "CDSL": ("Banking & Finance", "Capital Markets"),
    "BSE": ("Banking & Finance", "Capital Markets"),
    "NYKAA": ("FMCG & Staples", "FMCG"),
    "SWIGGY": ("FMCG & Staples", "FMCG"),
    "POLICYBZR": ("Banking & Finance", "Insurance"),
    "KAYNES": ("Information Technology", "IT"),
    "PREMIERENE": ("Energy & Power", "Power"),
    "WAAREEENER": ("Energy & Power", "Power"),
    "HYUNDAI": ("Automobile", "Auto"),
}


def ensure_data_dir() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)


def load_dynamic_universe() -> Dict:
    """Load persistent additions and exclusions."""
    ensure_data_dir()
    if not os.path.exists(OVERRIDE_FILE):
        return {
            "last_sync_ist": None,
            "added_stocks": {},  # symbol: {"sector": ..., "industry": ..., "fyers_symbol": ...}
            "archived_stocks": [],  # list of soft-archived short symbols
            "active_symbols_count": len(WATCHLIST),
        }
    try:
        with open(OVERRIDE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Could not read dynamic universe file: %s. Using default.", e)
        return {
            "last_sync_ist": None,
            "added_stocks": {},
            "archived_stocks": [],
            "active_symbols_count": len(WATCHLIST),
        }


def save_dynamic_universe(data: Dict) -> None:
    """Persist additions and exclusions to disk."""
    ensure_data_dir()
    with open(OVERRIDE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def fetch_nse_fno_directory() -> List[str]:
    """
    Download and parse official NSE F&O market lot CSV.
    Returns sorted list of unique underlying equity symbols.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    
    symbols: Set[str] = set()
    try:
        resp = requests.get(NSE_LOTS_CSV_URL, headers=headers, timeout=12)
        resp.raise_for_status()
        
        lines = resp.text.splitlines()
        reader = csv.reader(lines)
        
        for row in reader:
            if not row or len(row) < 2:
                continue
            # Column 1 is typically UNDERLYING / SYMBOL
            candidate = row[1].strip().upper()
            if not candidate or candidate in INDEX_EXCLUSIONS or "NIFTY" in candidate:
                continue
            # Exclude headers like 'SYMBOL' or 'UNDERLYING'
            if candidate in ("SYMBOL", "UNDERLYING", "NAME"):
                continue
            # Filter clean ticker names (letters, numbers, hyphens)
            if candidate.replace("-", "").isalnum():
                symbols.add(candidate)
                
    except Exception as e:
        logger.error("Failed to fetch NSE F&O market lots CSV: %s", e)
        raise

    return sorted(list(symbols))


def classify_symbol(symbol: str) -> Tuple[str, str]:
    """
    Determine the 11-sector group and fine-grained industry tag for any stock.
    Returns (official_sector, fine_industry).
    """
    clean_sym = symbol.replace("NSE:", "").replace("-EQ", "").strip().upper()

    # Check known entrants taxonomy
    if clean_sym in KNOWN_NEW_ENTRANTS_TAXONOMY:
        return KNOWN_NEW_ENTRANTS_TAXONOMY[clean_sym]

    # Check existing INDUSTRY_GROUP
    if clean_sym in INDUSTRY_GROUP:
        fine = INDUSTRY_GROUP[clean_sym]
        official = FINE_TO_OFFICIAL_SECTOR.get(fine, "Infra & Capital Goods")
        return (official, fine)

    # Check existing WATCHLIST
    fy_sym = f"NSE:{clean_sym}-EQ"
    if fy_sym in WATCHLIST:
        return (WATCHLIST[fy_sym], "General")

    # Fallback default for unexpected additions
    return ("Infra & Capital Goods", "Capital Goods")


def run_fno_sync() -> Dict:
    """
    Executes synchronization:
    1. Downloads latest F&O directory from NSE.
    2. Identifies additions and removals against current active universe.
    3. Categorizes additions into 11 authentic sectors.
    4. Soft-archives excluded stocks (never drops historical data).
    5. Persists update to dynamic_fno_universe.json.
    """
    now_ist = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")
    data = load_dynamic_universe()

    # Get current watchlist base symbols
    base_symbols = {short_symbol(s) for s in WATCHLIST.keys()}
    currently_added = set(data.get("added_stocks", {}).keys())
    current_archived = set(data.get("archived_stocks", []))

    all_current_active = (base_symbols | currently_added) - current_archived

    try:
        nse_symbols = set(fetch_nse_fno_directory())
        if not nse_symbols:
            raise ValueError("NSE returned empty F&O list")
    except Exception as e:
        logger.warning("NSE F&O direct fetch failed: %s. Keeping current universe.", e)
        return {
            "status": "warning",
            "message": f"Fetch failed: {e}. Universe maintained intact.",
            "total_active": len(all_current_active),
            "last_sync_ist": data.get("last_sync_ist"),
        }

    # Detect additions
    newly_added = nse_symbols - all_current_active
    # Detect removals
    newly_removed = all_current_active - nse_symbols

    added_dict = data.setdefault("added_stocks", {})
    archived_list = set(data.setdefault("archived_stocks", []))

    for sym in newly_added:
        official_sec, fine_ind = classify_symbol(sym)
        added_dict[sym] = {
            "sector": official_sec,
            "industry": fine_ind,
            "fyers_symbol": f"NSE:{sym}-EQ",
            "added_at": now_ist,
        }
        if sym in archived_list:
            archived_list.remove(sym)

    for sym in newly_removed:
        archived_list.add(sym)

    data["archived_stocks"] = sorted(list(archived_list))
    data["last_sync_ist"] = now_ist
    data["active_symbols_count"] = len((base_symbols | set(added_dict.keys())) - archived_list)

    save_dynamic_universe(data)

    logger.info(
        "NSE F&O Sync complete: %d active stocks (%d newly added, %d archived)",
        data["active_symbols_count"],
        len(newly_added),
        len(newly_removed),
    )

    return {
        "status": "success",
        "last_sync_ist": now_ist,
        "newly_added": list(newly_added),
        "newly_removed": list(newly_removed),
        "total_active": data["active_symbols_count"],
        "message": f"Sync verified: {data['active_symbols_count']} stocks aligned with NSE.",
    }
