"""
One-time Migration Script: Supabase candle_history -> Local SQLite (candles.sqlite)
==================================================================================
Usage (on Oracle VM or locally with SUPABASE_DB_URL set):
    python backend/scripts/migrate_candles_to_sqlite.py

This script downloads existing candle rows from Supabase Postgres and inserts
them into backend/data/candles.sqlite, ensuring you lose zero historical data
before running the TRUNCATE command in Supabase.
"""

import asyncio
import os
import sys
from pathlib import Path

# Add backend parent to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env")
    load_dotenv(".env")
except ImportError:
    pass

import asyncpg
from app import candle_history


async def migrate():
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        print("[-] SUPABASE_DB_URL environment variable is not set.")
        print("    If you don't need past historical candles, you can truncate Supabase directly.")
        print("    If you want to copy past data first, set SUPABASE_DB_URL in .env and rerun.")
        return

    print(f"[*] Connecting to Supabase Postgres...")
    try:
        conn = await asyncpg.connect(db_url, statement_cache_size=0, timeout=30.0)
    except Exception as e:
        print(f"[-] Failed to connect to Supabase: {e}")
        return

    print("[*] Querying existing candles from public.candle_history...")
    try:
        rows = await conn.fetch(
            """SELECT symbol, bucket_date, bucket_minute, open, high, low, close, delta, volume
               FROM public.candle_history
               ORDER BY bucket_date ASC, bucket_minute ASC"""
        )
        await conn.close()
    except Exception as e:
        print(f"[-] Failed to read candle_history from Supabase: {e}")
        return

    print(f"[+] Found {len(rows)} existing candles in Supabase.")
    if not rows:
        print("[*] Table is already empty. Nothing to migrate.")
        return

    print("[*] Inserting rows into local SQLite (data/candles.sqlite)...")
    migrated = 0
    for r in rows:
        await candle_history.persist_candle(
            symbol=r["symbol"],
            bucket_date=r["bucket_date"],
            bucket_minute=int(r["bucket_minute"]),
            ohlc=[float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"])],
            delta=float(r["delta"] or 0.0),
            volume=float(r["volume"] or 0.0),
        )
        migrated += 1
        if migrated % 2000 == 0:
            print(f"    -> Migrated {migrated}/{len(rows)} candles...")

    print(f"[✓] Successfully migrated all {migrated} candles into local SQLite!")
    print("[✓] It is now safe to run 'TRUNCATE TABLE public.candle_history CASCADE;' in Supabase.")


if __name__ == "__main__":
    asyncio.run(migrate())
