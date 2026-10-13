"""
Historical Candle Backfill Script for TradeDashBoard
=====================================================
Fetches 20 trading days of 5-minute OHLCV candles across the entire F&O
universe (210 stocks + NIFTY 50) and populates `candle_history` in SQLite.

Enables the Smart Money Engine to immediately calculate:
- Fresh Turnover Ratio (per same 5-minute slot)
- RVOL (Relative Volume per slot)
- Relative Strength vs NIFTY 50

Usage:
    python backend/scripts/backfill_historical_candles.py
    python backend/scripts/backfill_historical_candles.py --days 20
"""

import argparse
import asyncio
import logging
import os
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

# Setup paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from app import config
from app.config import ALL_SYMBOLS, IST, WATCHLIST, short_symbol

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("backfill")

DB_PATH = Path(getattr(config, "CANDLES_DB_PATH", PROJECT_ROOT / "backend" / "data" / "candles.sqlite"))


def get_sqlite_conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS candle_history (
            symbol TEXT NOT NULL,
            bucket_date TEXT NOT NULL,
            bucket_minute INTEGER NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            volume REAL DEFAULT 0,
            delta REAL DEFAULT 0,
            PRIMARY KEY (symbol, bucket_date, bucket_minute)
        );
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_candles_sym_date
        ON candle_history (symbol, bucket_date);
        """
    )
    conn.commit()


def backfill_via_fyers(lookback_days: int = 20):
    """Backfills 5-minute candles using Fyers historical REST API."""
    from app import auth
    from fyers_apiv3 import fyersModel

    token = auth.get_access_token()
    if not token:
        logger.warning("Fyers access token not found or expired.")
        return False

    client_id = getattr(config, "CLIENT_ID", "")
    fyers = fyersModel.FyersModel(
        client_id=client_id,
        is_async=False,
        token=token,
        log_path=str(PROJECT_ROOT / "backend" / "data"),
    )

    today = datetime.now(IST).date()
    # 20 trading days is roughly 30 calendar days
    range_from = (today - timedelta(days=lookback_days + 12)).strftime("%Y-%m-%d")
    range_to = today.strftime("%Y-%m-%d")

    symbols_to_backfill = list(ALL_SYMBOLS)
    if "NSE:NIFTY50-INDEX" not in symbols_to_backfill:
        symbols_to_backfill.append("NSE:NIFTY50-INDEX")

    conn = get_sqlite_conn()
    init_db(conn)

    total_inserted = 0
    logger.info("Starting Fyers backfill for %d symbols (%s to %s)...", len(symbols_to_backfill), range_from, range_to)

    for i, fy_sym in enumerate(symbols_to_backfill, 1):
        clean_sym = "NIFTY50" if "NIFTY50" in fy_sym else short_symbol(fy_sym)
        try:
            time.sleep(0.08)  # rate limit compliance
            req = {
                "symbol": fy_sym,
                "resolution": "5",
                "date_format": "1",
                "range_from": range_from,
                "range_to": range_to,
                "cont_flag": "1",
            }
            resp = fyers.history(req)
            if not isinstance(resp, dict) or resp.get("s") != "ok":
                continue

            candles = resp.get("candles", [])
            if not candles:
                continue

            rows_to_insert = []
            for c in candles:
                # c = [epoch_timestamp, open, high, low, close, volume]
                ts = c[0]
                dt = datetime.fromtimestamp(ts, tz=IST)
                # Keep only market hours: 09:15 to 15:30
                b_date = dt.date().isoformat()
                b_minute = dt.hour * 60 + dt.minute
                if b_minute < 555 or b_minute > 930:
                    continue

                rows_to_insert.append((
                    clean_sym,
                    b_date,
                    b_minute,
                    float(c[1]),
                    float(c[2]),
                    float(c[3]),
                    float(c[4]),
                    float(c[5]) if len(c) > 5 else 0.0,
                    0.0,  # historical tick delta
                ))

            if rows_to_insert:
                conn.executemany(
                    """
                    INSERT INTO candle_history
                    (symbol, bucket_date, bucket_minute, open, high, low, close, volume, delta)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(symbol, bucket_date, bucket_minute) DO UPDATE SET
                        open=excluded.open,
                        high=excluded.high,
                        low=excluded.low,
                        close=excluded.close,
                        volume=excluded.volume;
                    """,
                    rows_to_insert,
                )
                conn.commit()
                total_inserted += len(rows_to_insert)

            if i % 25 == 0 or i == len(symbols_to_backfill):
                logger.info("[%d/%d] Processed %s (candles: %d, total in DB: %d)", i, len(symbols_to_backfill), clean_sym, len(rows_to_insert), total_inserted)

        except Exception as e:
            logger.warning("Error backfilling %s: %s", clean_sym, e)

    conn.close()
    logger.info("Fyers historical backfill complete! Inserted/Updated %d candles.", total_inserted)
    return True


def backfill_via_aliceblue(lookback_days: int = 20):
    """Backfills 5-minute candles using Alice Blue historical API."""
    import requests
    from app import aliceblue_auth
    from app.aliceblue_service import aliceblue_engine

    session_token = aliceblue_auth.get_cached_session()
    if not session_token:
        logger.info("No cached Alice Blue session; logging in headlessly...")
        session_token = aliceblue_auth.login_automatically()

    if not session_token:
        logger.error("Alice Blue authentication failed. Cannot backfill.")
        return False

    if not aliceblue_engine.contract_master._loaded:
        aliceblue_engine.contract_master.load_contracts()

    today = datetime.now(IST).date()
    from_date = today - timedelta(days=lookback_days + 10)
    from_epoch = int(datetime(from_date.year, from_date.month, from_date.day, 9, 15, tzinfo=IST).timestamp())
    to_epoch = int(datetime(today.year, today.month, today.day, 15, 30, tzinfo=IST).timestamp())

    conn = get_sqlite_conn()
    init_db(conn)

    headers = {
        "Authorization": f"Bearer {session_token}",
        "Content-Type": "application/json",
    }

    HIST_URL = "https://a3.aliceblueonline.com/open-api/od/v1/chart/history"
    symbols_to_backfill = list(ALL_SYMBOLS)
    total_inserted = 0
    logger.info("Starting Alice Blue chart history backfill for %d symbols...", len(symbols_to_backfill))

    for i, fy_sym in enumerate(symbols_to_backfill, 1):
        clean_sym = short_symbol(fy_sym)
        tok = aliceblue_engine.contract_master.get_token(clean_sym)
        if not tok:
            continue

        try:
            time.sleep(0.06)
            payload = {
                "token": str(tok),
                "exchange": "NSE",
                "from": str(from_epoch),
                "to": str(to_epoch),
                "resolution": "5",
            }
            resp = requests.post(HIST_URL, headers=headers, json=payload, timeout=10)
            if resp.status_code != 200:
                continue

            data = resp.json()
            candles = data.get("result", []) or data.get("data", []) or data.get("candles", [])
            if not isinstance(candles, list) or not candles:
                continue

            rows_to_insert = []
            for c in candles:
                if isinstance(c, dict):
                    ts = c.get("time") or c.get("t")
                    o, h, l, cl = c.get("open"), c.get("high"), c.get("low"), c.get("close")
                    v = c.get("volume", 0.0)
                elif isinstance(c, (list, tuple)) and len(c) >= 5:
                    ts, o, h, l, cl = c[0], c[1], c[2], c[3], c[4]
                    v = c[5] if len(c) > 5 else 0.0
                else:
                    continue

                if not ts:
                    continue
                dt = datetime.fromtimestamp(ts, tz=IST)
                b_date = dt.date().isoformat()
                b_minute = dt.hour * 60 + dt.minute
                if b_minute < 555 or b_minute > 930:
                    continue

                rows_to_insert.append((clean_sym, b_date, b_minute, float(o), float(h), float(l), float(cl), float(v), 0.0))

            if rows_to_insert:
                conn.executemany(
                    """
                    INSERT INTO candle_history
                    (symbol, bucket_date, bucket_minute, open, high, low, close, volume, delta)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(symbol, bucket_date, bucket_minute) DO UPDATE SET
                        open=excluded.open,
                        high=excluded.high,
                        low=excluded.low,
                        close=excluded.close,
                        volume=excluded.volume;
                    """,
                    rows_to_insert,
                )
                conn.commit()
                total_inserted += len(rows_to_insert)

            if i % 25 == 0 or i == len(symbols_to_backfill):
                logger.info("[%d/%d] Alice Blue: %s (inserted %d, total %d)", i, len(symbols_to_backfill), clean_sym, len(rows_to_insert), total_inserted)

        except Exception as e:
            logger.warning("Alice Blue backfill failed for %s: %s", clean_sym, e)

    conn.close()
    logger.info("Alice Blue backfill complete! Total candles: %d", total_inserted)
    return True


def main():
    parser = argparse.ArgumentParser(description="Backfill 20 trading days of historical candles.")
    parser.add_argument("--days", type=int, default=20, help="Number of trading days to look back")
    parser.add_argument("--source", choices=["auto", "fyers", "aliceblue"], default="auto")
    args = parser.parse_args()

    success = False
    if args.source in ("auto", "fyers"):
        logger.info("Attempting backfill via Fyers API...")
        success = backfill_via_fyers(args.days)

    if not success and args.source in ("auto", "aliceblue"):
        logger.info("Attempting backfill via Alice Blue API...")
        success = backfill_via_aliceblue(args.days)

    if success:
        logger.info("[✓] Successfully backfilled historical candles into SQLite!")
        from app import smart_money
        asyncio.run(smart_money.compute_rankings())
        logger.info("[✓] Smart Money rankings recomputed! Current eligible symbols: %d", smart_money.get_latest()["eligible_symbols"])
    else:
        logger.error("Backfill failed: no broker API succeeded. Check API credentials.")


if __name__ == "__main__":
    main()
