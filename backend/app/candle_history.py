"""
Persists completed 5-min candles to Postgres (backtest groundwork — see
candle_aggregator.py's `_day_candles` tracker) and reads them back for the
Charts tab (candle_query.py merges this with the in-progress bucket). Reuses
the same asyncpg pool paper_trading.py already owns; no second connection pool.
"""

import logging

logger = logging.getLogger(__name__)


async def persist_candle(
    symbol: str, bucket_date, bucket_minute: int, ohlc: list, delta: float = 0.0
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
                "(symbol, bucket_date, bucket_minute, open, high, low, close, delta) "
                "values ($1,$2,$3,$4,$5,$6,$7,$8) "
                "on conflict (symbol, bucket_date, bucket_minute) do nothing",
                symbol,
                bucket_date,
                bucket_minute,
                open_,
                high,
                low,
                close,
                delta,
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
