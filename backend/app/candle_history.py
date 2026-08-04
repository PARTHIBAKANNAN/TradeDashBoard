"""
Persists completed 5-min candles to Postgres — backtest groundwork only (see
candle_aggregator.py's `_day_candles` tracker). Reuses the same asyncpg pool
paper_trading.py already owns; no second connection pool. The actual replay/
analysis tool that reads this data back is a separate, later piece of work.
"""

import logging

logger = logging.getLogger(__name__)


async def persist_candle(symbol: str, bucket_date, bucket_minute: int, ohlc: list) -> None:
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return
    open_, high, low, close = ohlc
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "insert into public.candle_history "
                "(symbol, bucket_date, bucket_minute, open, high, low, close) "
                "values ($1,$2,$3,$4,$5,$6,$7) "
                "on conflict (symbol, bucket_date, bucket_minute) do nothing",
                symbol, bucket_date, bucket_minute, open_, high, low, close,
            )
    except Exception:  # noqa: BLE001 — never let a recording failure break tick processing
        logger.warning("persist_candle failed for %s", symbol, exc_info=True)
