"""
REST surface for the Charts tab.

Endpoints:
  GET /api/charts/candles/{symbol}
      Today's 5-min candles with prev-day fallback. Used by the grid card
      on first mount.

  GET /api/charts/candles/{symbol}/day?date=YYYY-MM-DD
      Completed candles for a specific historical date. Used by the
      ◀ Prev Day / Today ▶ navigation buttons on each card.

  GET /api/charts/candles/{symbol}/history?days=21
      All available candles across the last N trading days for the
      full-screen modal (continuous multi-day time series).

All three endpoints include the same `levels` dict (today's ORB + Pivot +
Prev-day High/Low) — the modal always shows today's reference lines regardless
of which day's candles are displayed.
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from . import candle_query, security
from .state import market_state

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/charts", tags=["charts"], dependencies=[Depends(security.require_login)]
)


def _stock_or_404(symbol: str) -> dict:
    stock = market_state.get_stock(symbol)
    if stock is None:
        raise HTTPException(status_code=404, detail=f"unknown symbol: {symbol}")
    return stock


@router.get("/candles/{symbol}")
async def get_candles(symbol: str):
    """Today's candles with automatic prev-day fallback (pre-market / weekend)."""
    stock = _stock_or_404(symbol)
    result = await candle_query.get_today_candles(symbol)
    result["levels"] = candle_query.get_levels(stock)
    return result


@router.get("/candles/{symbol}/day")
async def get_day_candles(symbol: str, date: date = Query(..., description="ISO date YYYY-MM-DD")):
    """Candles for a specific date — used by the ◀ Prev Day / Today ▶ nav."""
    stock = _stock_or_404(symbol)
    result = await candle_query.get_date_candles(symbol, date)
    result["levels"] = candle_query.get_levels(stock)
    return result


@router.get("/candles/{symbol}/history")
async def get_history_candles(
    symbol: str,
    days: int = Query(default=21, ge=1, le=60, description="Number of trading days to fetch"),
):
    """Multi-day candles for the full-screen modal (continuous time series)."""
    stock = _stock_or_404(symbol)
    result = await candle_query.get_multi_day_candles(symbol, days)
    result["levels"] = candle_query.get_levels(stock)
    return result


@router.get("/all-mini-candles")
async def get_all_mini_candles():
    """All symbols' today 5-min candles in one batch to seed the watchlist mini-charts."""
    return await candle_query.get_all_mini_candles()
