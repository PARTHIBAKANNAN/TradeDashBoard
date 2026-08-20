"""
Persists completed 5-min candles to Postgres (backtest groundwork — see
candle_aggregator.py's `_day_candles` tracker) and reads them back for the
Charts tab (candle_query.py merges this with the in-progress bucket). Reuses
the same asyncpg pool paper_trading.py already owns; no second connection pool.
"""

import logging

logger = logging.getLogger(__name__)


async def persist_candle(
    symbol: str,
    bucket_date,
    bucket_minute: int,
    ohlc: list,
    delta: float = 0.0,
    volume: float = 0.0,
) -> None:
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return
    open_, high, low, close = ohlc
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "insert into public.candle_history "
                "(symbol, bucket_date, bucket_minute, open, high, low, close, delta, volume) "
                "values ($1,$2,$3,$4,$5,$6,$7,$8,$9) "
                "on conflict (symbol, bucket_date, bucket_minute) do nothing",
                symbol,
                bucket_date,
                bucket_minute,
                open_,
                high,
                low,
                close,
                delta,
                volume,
            )
    except Exception:  # noqa: BLE001 — never let a recording failure break tick processing
        logger.warning("persist_candle failed for %s", symbol, exc_info=True)


async def get_candles(symbol: str, bucket_date) -> list[dict]:
    """Every completed 5-min candle for `symbol` on `bucket_date`, oldest first.
    Empty list if the paper-trading pool isn't configured or nothing's recorded
    yet (e.g. before the first bucket of the day has rolled over)."""
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select bucket_minute, open, high, low, close, delta from public.candle_history "
            "where symbol=$1 and bucket_date=$2 order by bucket_minute",
            symbol,
            bucket_date,
        )
    return [dict(r) for r in rows]


async def get_all_today_candles(bucket_date) -> dict[str, list[dict]]:
    """Every completed 5-min candle for all symbols on bucket_date, grouped by symbol."""
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return {}
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select symbol, bucket_minute, open, high, low, close from public.candle_history "
            "where bucket_date=$1 order by symbol, bucket_minute",
            bucket_date,
        )
    res: dict[str, list[dict]] = {}
    for r in rows:
        sym = r["symbol"]
        res.setdefault(sym, []).append(
            {
                "bucket": r["bucket_minute"],
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
            }
        )
    return res


async def get_candles_range(symbol: str, from_date, to_date) -> list[dict]:
    """Every completed 5-min candle for `symbol` between `from_date` and
    `to_date` (inclusive), ordered oldest first. Used by the multi-day modal
    endpoint and the prev-day fallback in candle_query.py."""
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select bucket_date, bucket_minute, open, high, low, close, delta, volume "
            "from public.candle_history "
            "where symbol=$1 and bucket_date >= $2 and bucket_date <= $3 "
            "order by bucket_date, bucket_minute",
            symbol,
            from_date,
            to_date,
        )
    return [dict(r) for r in rows]


async def get_latest_candle_date(symbol: str):
    """Returns the most recent `bucket_date` stored for `symbol`, or None
    if no candles exist yet. Used by the prev-day fallback: when today has no
    data (pre-market / weekend), serve the last available day instead."""
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select max(bucket_date) as latest_date from public.candle_history " "where symbol=$1",
            symbol,
        )
    return row["latest_date"] if row else None


async def delete_candles_older_than(cutoff_date) -> int:
    """Deletes all rows with `bucket_date < cutoff_date`. Returns the number
    of rows deleted. Called by the 15:35 IST scheduler job for 21-day
    rolling retention (cutoff = today - 30 calendar days ≈ 21 trading days)."""
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return 0
    async with pool.acquire() as conn:
        result = await conn.execute(
            "delete from public.candle_history where bucket_date < $1",
            cutoff_date,
        )
    # asyncpg returns "DELETE N" as a string
    try:
        deleted = int(result.split()[-1])
    except (ValueError, IndexError, AttributeError):
        deleted = 0
    logger.info("retention: deleted %d candle rows older than %s", deleted, cutoff_date)
    return deleted


async def get_today_all_symbols(bucket_date) -> dict[str, list[dict]]:
    """Every completed 5-min candle for EVERY symbol on `bucket_date`, grouped
    by symbol, oldest-first within each group — one query for the whole
    universe instead of one per symbol. Used by smart_money.py, which needs
    "today's open" (first row) and "latest close/volume" (last row) for all
    ~210 symbols + the benchmark every time it recomputes rankings."""
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return {}
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select symbol, bucket_minute, open, high, low, close, volume "
            "from public.candle_history where bucket_date=$1 order by symbol, bucket_minute",
            bucket_date,
        )
    grouped: dict[str, list[dict]] = {}
    for r in rows:
        grouped.setdefault(r["symbol"], []).append(dict(r))
    return grouped


async def get_historical_slot_stats(before_date, lookback_days: int = 20) -> dict[tuple, dict]:
    """For every (symbol, bucket_minute) pair, the average volume + average
    "fresh turnover" (close x volume) over that symbol's last `lookback_days`
    distinct trading dates strictly before `before_date`, plus how many days
    actually went into the average — smart_money.py uses that count to decide
    whether a symbol has enough history yet for its ratio metrics to be
    meaningful. One query for the whole universe (not one per symbol)."""
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return {}
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            with recent_dates as (
                select symbol, bucket_date,
                       row_number() over (partition by symbol order by bucket_date desc) as rn
                from (select distinct symbol, bucket_date from public.candle_history
                      where bucket_date < $1) d
            )
            select c.symbol, c.bucket_minute,
                   avg(c.volume) as avg_volume,
                   avg(c.close * c.volume) as avg_turnover,
                   count(*) as days
            from public.candle_history c
            join recent_dates rd on rd.symbol = c.symbol and rd.bucket_date = c.bucket_date
            where rd.rn <= $2
            group by c.symbol, c.bucket_minute
            """,
            before_date,
            lookback_days,
        )
    return {
        (r["symbol"], r["bucket_minute"]): {
            "avg_volume": float(r["avg_volume"] or 0.0),
            "avg_turnover": float(r["avg_turnover"] or 0.0),
            "days": r["days"],
        }
        for r in rows
    }


async def get_startup_snapshot() -> dict[str, dict]:
    """For every symbol, the two most recent DISTINCT trading dates on record
    (d0 = most recent, d1 = the one before it) with each date's high/low/last
    close. Used by seed_missing_state() below to give MarketState a real
    "last known" value instead of a hardcoded 0 whenever REST backfill can't
    (this account's -403 permission gap) or a restart wipes RAM outside
    market hours. One query for the whole universe."""
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return {}
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            with ranked_dates as (
                select symbol, bucket_date,
                       row_number() over (partition by symbol order by bucket_date desc) as rn
                from (select distinct symbol, bucket_date from public.candle_history) d
            )
            select c.symbol, rd.rn,
                   max(c.high) as high, min(c.low) as low,
                   (array_agg(c.close order by c.bucket_minute desc))[1] as close,
                   max(c.bucket_date) as bucket_date
            from public.candle_history c
            join ranked_dates rd on rd.symbol = c.symbol and rd.bucket_date = c.bucket_date
            where rd.rn <= 2
            group by c.symbol, rd.rn
            """)
    out: dict[str, dict] = {}
    for r in rows:
        entry = out.setdefault(r["symbol"], {})
        prefix = "d0" if r["rn"] == 1 else "d1"
        entry[f"{prefix}_date"] = r["bucket_date"]
        entry[f"{prefix}_high"] = float(r["high"]) if r["high"] is not None else None
        entry[f"{prefix}_low"] = float(r["low"]) if r["low"] is not None else None
        entry[f"{prefix}_close"] = float(r["close"]) if r["close"] is not None else None
    return out


async def seed_missing_state(market_state) -> None:
    """Called once at backend startup, and again daily at 08:45 IST (before
    market open) — see scheduler.py's _daily_login(). MarketState is 100%
    in-RAM and wiped on every restart; REST backfill is also permanently
    broken on this FYERS account (-403), so without this, `yesterday_high`/
    `yesterday_low`/`ltp`/`pct_change` would otherwise show a hard 0 until
    live ticks arrive that day. Backfills a "last known" display state from
    candle_history's own archive instead. Every field is only ever filled in
    if it's currently falsy — a working REST backfill or live ticks always
    win, this is purely a fallback for what they haven't set (yet)."""
    from datetime import datetime

    from .calculations import pct_change as _pct_change
    from .config import IST

    snapshot = await get_startup_snapshot()
    if not snapshot:
        return
    today = datetime.now(IST).date()
    with market_state.lock():
        for sym, snap in snapshot.items():
            stock = market_state.stocks.get(sym)
            if not stock:
                continue
            # d0 is "today" once live ticks/backfill have written at least one
            # bucket today; until then, d0 is really "yesterday" from today's
            # point of view, and d1 is the day before that.
            if snap.get("d0_date") == today:
                y_high, y_low, y_close = (
                    snap.get("d1_high"),
                    snap.get("d1_low"),
                    snap.get("d1_close"),
                )
            else:
                y_high, y_low, y_close = (
                    snap.get("d0_high"),
                    snap.get("d0_low"),
                    snap.get("d0_close"),
                )
                if not stock["ltp"] and snap.get("d0_close"):
                    stock["ltp"] = snap["d0_close"]
                if not stock["prev_close"] and snap.get("d1_close"):
                    stock["prev_close"] = snap["d1_close"]
                    stock["pct_change"] = _pct_change(stock["ltp"], stock["prev_close"])
            if not stock["yesterday_high"] and y_high:
                stock["yesterday_high"] = y_high
            if not stock["yesterday_low"] and y_low:
                stock["yesterday_low"] = y_low
            if not stock["prev_close"] and y_close:
                stock["prev_close"] = y_close
