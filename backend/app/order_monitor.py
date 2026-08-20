"""
In-memory index of live-monitored paper orders, checked on every market tick.

Bracket exits (SL/Target) and pending LIMIT fills must react to every live
tick, not just to explicit API calls. Querying Postgres per-tick across ~170
symbols at sub-second cadence would be far too much DB load, so this module
keeps a cheap in-memory mirror of the relevant PENDING/OPEN rows. The mirror
is updated synchronously by paper_trading.py right after every DB mutation,
and rebuilt from Postgres once on backend startup (`load_from_db`) — Postgres
remains the source of truth, this is just a cache.

paper_trading.py does the actual DB mutations (it owns the connection pool),
so the calls back into it below are deferred imports to avoid a circular
top-level import between the two modules.
"""

import asyncio
import logging

from . import trailing_stop

logger = logging.getLogger(__name__)

_pending_limits: dict[str, list[dict]] = {}  # symbol -> [order dict]
_open_brackets: dict[str, list[dict]] = {}  # symbol -> [order dict]

# Event loop the FastAPI app (and the asyncpg pool) runs on. Ticks can arrive
# from a background thread (the FYERS websocket callback), so reacting to
# them requires hopping onto this loop — see on_tick_threadsafe.
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def get_loop() -> asyncio.AbstractEventLoop | None:
    return _loop


def register_pending_limit(order: dict) -> None:
    _pending_limits.setdefault(order["symbol"], []).append(order)


def register_open_bracket(order: dict) -> None:
    if not order.get("sl_price") and not order.get("target_price") and not order.get("tsl_type"):
        return  # nothing to watch for this position
    _open_brackets.setdefault(order["symbol"], []).append(order)


def unregister(order_id: int, symbol: str) -> None:
    _pending_limits[symbol] = [o for o in _pending_limits.get(symbol, []) if o["id"] != order_id]
    _open_brackets[symbol] = [o for o in _open_brackets.get(symbol, []) if o["id"] != order_id]


def _limit_hit(order: dict, ltp: float) -> bool:
    if order["side"] == "BUY":
        return ltp <= float(order["limit_price"])
    return ltp >= float(order["limit_price"])


def _bracket_hit(order: dict, ltp: float) -> str | None:
    sl = order.get("sl_price")
    target = order.get("target_price")
    if order["side"] == "BUY":
        if sl and ltp <= float(sl):
            return "SL"
        if target and ltp >= float(target):
            return "TARGET"
    else:
        if sl and ltp >= float(sl):
            return "SL"
        if target and ltp <= float(target):
            return "TARGET"
    return None


def _ratchet_trailing_stop(order: dict, ltp: float) -> None:
    """Mutate `order` in place: advance peak_price and, if favorable, sl_price.
    Runs before the bracket-hit check on the same tick so a stop crossed by
    this tick's own ratchet is caught immediately, not one tick late."""
    prev_peak = order.get("peak_price") or order["entry_price"]
    entry_val = float(order["entry_price"])
    new_peak = trailing_stop.update_peak(order["side"], float(prev_peak), ltp)
    prev_sl = float(order["sl_price"]) if order.get("sl_price") else None
    candidate = trailing_stop.trailing_sl_price(
        order["side"], entry_val, new_peak, order["tsl_type"], float(order["tsl_value"]), prev_sl
    )
    new_sl = trailing_stop.ratchet_sl(order["side"], prev_sl, candidate)

    changed = new_peak != prev_peak or new_sl != prev_sl
    order["peak_price"] = new_peak
    order["sl_price"] = new_sl
    if changed:
        from . import paper_trading

        asyncio.create_task(
            paper_trading.update_trailing_stop(order["id"], order["user_id"], new_sl, new_peak)
        )


async def on_tick(symbol: str, ltp: float) -> None:
    """React to a live price tick for one symbol. Cheap dict lookups only —
    DB writes (rare relative to raw tick volume) happen via fire-and-forget
    tasks so this never blocks the tick that triggered them."""
    from . import paper_trading

    for order in list(_pending_limits.get(symbol, [])):
        if _limit_hit(order, ltp):
            asyncio.create_task(paper_trading.fill_order(order["id"], order["user_id"], ltp))
    for order in list(_open_brackets.get(symbol, [])):
        if order.get("tsl_type"):
            _ratchet_trailing_stop(order, ltp)
        reason = _bracket_hit(order, ltp)
        if reason:
            asyncio.create_task(
                paper_trading.close_order(order["id"], order["user_id"], reason, ltp)
            )


def on_tick_threadsafe(symbol: str, ltp: float) -> None:
    """Sync entry point for calculations.py's process_incoming_tick, which may
    run on a background thread (the FYERS websocket callback thread)."""
    if _loop is None:
        return  # paper trading not configured
    if symbol not in _pending_limits and symbol not in _open_brackets:
        return  # nothing monitored for this symbol — skip the loop hop
    asyncio.run_coroutine_threadsafe(on_tick(symbol, ltp), _loop)


async def load_from_db() -> None:
    """Rebuild the in-memory index from Postgres. Called once on backend
    startup so a restart doesn't silently drop live order monitoring."""
    from . import paper_trading

    pool = paper_trading.get_pool()
    if pool is None:
        return
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select id, user_id, symbol, side, quantity, order_type, limit_price, "
            "sl_price, target_price, entry_price, tsl_type, tsl_value, peak_price, status "
            "from public.paper_orders where status in ('PENDING', 'OPEN')"
        )
    _pending_limits.clear()
    _open_brackets.clear()
    for r in rows:
        order = dict(r)
        if order["status"] == "PENDING":
            register_pending_limit(order)
        else:
            register_open_bracket(order)
    logger.info(
        "Rebuilt index: %d symbol(s) with pending limits, %d symbol(s) with open brackets.",
        len(_pending_limits),
        len(_open_brackets),
    )
