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
    if not order.get("sl_price") and not order.get("target_price"):
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


async def on_tick(symbol: str, ltp: float) -> None:
    """React to a live price tick for one symbol. Cheap dict lookups only —
    DB writes (rare relative to raw tick volume) happen via fire-and-forget
    tasks so this never blocks the tick that triggered them."""
    from . import paper_trading

    for order in list(_pending_limits.get(symbol, [])):
        if _limit_hit(order, ltp):
            asyncio.create_task(paper_trading.fill_order(order["id"], order["user_id"], ltp))
    for order in list(_open_brackets.get(symbol, [])):
        reason = _bracket_hit(order, ltp)
        if reason:
            asyncio.create_task(paper_trading.close_order(order["id"], order["user_id"], reason, ltp))


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
            "sl_price, target_price, entry_price, status from public.paper_orders "
            "where status in ('PENDING', 'OPEN')"
        )
    _pending_limits.clear()
    _open_brackets.clear()
    for r in rows:
        order = dict(r)
        if order["status"] == "PENDING":
            register_pending_limit(order)
        else:
            register_open_bracket(order)
    print(
        f"[order_monitor] Rebuilt index: {len(_pending_limits)} symbol(s) with pending "
        f"limits, {len(_open_brackets)} symbol(s) with open brackets."
    )
