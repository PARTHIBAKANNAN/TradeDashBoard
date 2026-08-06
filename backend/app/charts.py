"""
REST surface for the Charts tab: one stock's today-so-far 5-min candles plus
the two reference levels (opening range + previous day high/low). Separate
from the live 250ms broadcast on purpose — chart data is fetched once per
symbol view, not on every tick; live-updating the currently-viewed chart is
the frontend's job via the existing per-symbol tick stream (useStock).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from . import candle_query, security
from .state import market_state

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/charts", tags=["charts"], dependencies=[Depends(security.require_login)]
)


@router.get("/candles/{symbol}")
async def get_candles(symbol: str):
    stock = market_state.get_stock(symbol)
    if stock is None:
        raise HTTPException(status_code=404, detail=f"unknown symbol: {symbol}")
    result = await candle_query.get_today_candles(symbol)
    result["levels"] = candle_query.get_levels(stock)
    return result
