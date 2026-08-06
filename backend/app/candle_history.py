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
