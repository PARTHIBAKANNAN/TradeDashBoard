"""
Simulated ("paper") intraday trading: Market/Limit entries with optional
bracket SL/Target, a virtual cash-margin wallet, live positions, and history.
Never touches the real FYERS order-placement API (no such capability is even
permissioned on this account) — every price used here comes from the same
live `market_state` the rest of the dashboard reads.

Per-user isolation is enforced app-side: every query below is scoped with an
explicit `where user_id = $1`. Postgres RLS policies in migrations/001_orders.sql
exist as defense-in-depth documentation only — this backend connects via one
pooled asyncpg service connection, not per-user JWTs, so `auth.uid()` never
resolves here.
"""

import asyncio
from datetime import datetime
from decimal import Decimal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from . import config, order_monitor, paper_margin, paper_pnl, security
from .state import market_state

router = APIRouter(
    prefix="/api/paper", tags=["paper-trading"], dependencies=[Depends(security.require_login)]
)

_pool: asyncpg.Pool | None = None


def get_pool() -> asyncpg.Pool | None:
    return _pool


async def init_pool() -> None:
    """Called from main.py's lifespan on startup."""
    global _pool
    if not config.SUPABASE_DB_URL:
        print("[paper_trading] SUPABASE_DB_URL not set; paper trading disabled.")
        return
    # statement_cache_size=0: Supabase's Transaction pooler (pgbouncer, transaction
    # mode) doesn't support asyncpg's prepared statements — each pooled connection
    # can be handed to a different backend session between statements, so a
    # server-side prepared statement from one asyncpg connection can collide with
    # another's (DuplicatePreparedStatementError). Disabling the cache makes every
    # query a plain unprepared statement, which pgbouncer transaction mode supports.
    _pool = await asyncpg.create_pool(
        config.SUPABASE_DB_URL, min_size=1, max_size=5, statement_cache_size=0
    )
    order_monitor.set_loop(asyncio.get_running_loop())
    await order_monitor.load_from_db()
    print("[paper_trading] DB pool ready.")


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _serialize(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, Decimal):
            out[k] = float(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


async def ensure_wallet(user_id: str) -> None:
    if _pool is None:
        return
    async with _pool.acquire() as conn:
        await conn.execute(
            "insert into public.paper_wallets (user_id) values ($1) on conflict (user_id) do nothing",
            user_id,
        )


async def _current_user_id(request: Request) -> str:
    user_id = security.current_user_id(request)
    await ensure_wallet(user_id)
    return user_id


def _require_pool() -> asyncpg.Pool:
    if _pool is None:
        raise HTTPException(status_code=503, detail="paper trading is not configured")
    return _pool


# ---------------- shared mutation logic (used by endpoints, order_monitor, and scheduler square-off) ----------------
async def fill_order(order_id: int, user_id: str, ltp: float) -> dict | None:
    """Fill a PENDING limit order at the given (already-crossed) price."""
    pool = get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "select * from public.paper_orders where id=$1 and user_id=$2 and status='PENDING' "
                "for update",
                order_id, user_id,
            )
            if row is None:
                return None
            margin = paper_margin.required_margin(ltp, row["quantity"])
            wallet = await conn.fetchrow(
                "select balance from public.paper_wallets where user_id=$1 for update", user_id,
            )
            if wallet is None or float(wallet["balance"]) < margin:
                # Balance dropped below what's needed since the order was placed
                # (e.g. margin locked by other fills) — auto-cancel rather than
                # leaving it stuck PENDING forever.
                await conn.execute(
                    "update public.paper_orders set status='CANCELLED' where id=$1", order_id,
                )
                order_monitor.unregister(order_id, row["symbol"])
                return None
            await conn.execute(
                "update public.paper_wallets set balance = balance - $1, updated_at = now() "
                "where user_id = $2",
                margin, user_id,
            )
            filled = await conn.fetchrow(
                "update public.paper_orders set status='OPEN', entry_price=$1, margin_locked=$2, "
                "peak_price=case when tsl_type is not null then $1 else peak_price end, "
                "filled_at=now() where id=$3 returning *",
                ltp, margin, order_id,
            )
    order_monitor.unregister(order_id, row["symbol"])
    order_monitor.register_open_bracket(dict(filled))
    return _serialize(dict(filled))


async def update_trailing_stop(order_id: int, user_id: str, sl_price: float, peak_price: float) -> None:
    """System-driven: called only from order_monitor's tick-driven ratchet, never
    from a user request, so no separate ownership ambiguity beyond the WHERE clause."""
    pool = get_pool()
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            "update public.paper_orders set sl_price=$1, peak_price=$2 "
            "where id=$3 and user_id=$4 and status='OPEN'",
            sl_price, peak_price, order_id, user_id,
        )


async def close_order(order_id: int, user_id: str, reason: str, exit_price: float) -> dict | None:
    """Close an OPEN position (manual exit, SL/Target trigger, or square-off)."""
    pool = get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "select * from public.paper_orders where id=$1 and user_id=$2 and status='OPEN' "
                "for update",
                order_id, user_id,
            )
            if row is None:
                return None
            pnl = paper_pnl.realized_pnl(
                row["side"], row["quantity"], float(row["entry_price"]), exit_price
            )
            credit = float(row["margin_locked"] or 0) + pnl
            await conn.execute(
                "update public.paper_wallets set balance = balance + $1, updated_at = now() "
                "where user_id = $2",
                credit, user_id,
            )
            closed = await conn.fetchrow(
                "update public.paper_orders set status='CLOSED', close_reason=$1, exit_price=$2, "
                "realized_pnl=$3, closed_at=now() where id=$4 returning *",
                reason, exit_price, pnl, order_id,
            )
    order_monitor.unregister(order_id, row["symbol"])
    return _serialize(dict(closed))


async def square_off_all() -> None:
    """Force-close every OPEN position and cancel every PENDING limit, across
    all users — called once at 15:30 IST market close (scheduler.py)."""
    pool = get_pool()
    if pool is None:
        return
    async with pool.acquire() as conn:
        open_rows = await conn.fetch(
            "select id, user_id, symbol from public.paper_orders where status='OPEN'"
        )
        pending_rows = await conn.fetch(
            "select id, symbol from public.paper_orders where status='PENDING'"
        )
    closed = 0
    for r in open_rows:
        stock = market_state.get_stock(r["symbol"])
        ltp = stock["ltp"] if stock else None
        if not ltp:
            continue  # no live price to close at; leave open rather than closing at 0
        if await close_order(r["id"], r["user_id"], "SQUARE_OFF", ltp):
            closed += 1
    if pending_rows:
        async with pool.acquire() as conn:
            await conn.execute("update public.paper_orders set status='CANCELLED' where status='PENDING'")
        for r in pending_rows:
            order_monitor.unregister(r["id"], r["symbol"])
    print(f"[paper_trading] Square-off: closed {closed} open position(s), cancelled {len(pending_rows)} pending order(s).")


def square_off_all_sync() -> None:
    """Thread-safe entry point for scheduler.py (runs on APScheduler's worker thread,
    not the asyncio loop the DB pool belongs to)."""
    loop = order_monitor.get_loop()
    if loop is None or _pool is None:
        return
    future = asyncio.run_coroutine_threadsafe(square_off_all(), loop)
    try:
        future.result(timeout=30)
    except Exception as exc:  # noqa: BLE001
        print(f"[paper_trading] square-off failed: {exc!r}")


# ---------------- request/response models ----------------
class PlaceOrderBody(BaseModel):
    symbol: str
    side: str
    quantity: int
    order_type: str
    limit_price: float | None = None
    sl_price: float | None = None
    target_price: float | None = None
    tsl_type: str | None = None
    tsl_value: float | None = None


class ModifyPositionBody(BaseModel):
    sl_price: float | None = None
    target_price: float | None = None
    tsl_type: str | None = None
    tsl_value: float | None = None


# ---------------- endpoints ----------------
@router.get("/margin")
async def get_margin(symbol: str, request: Request):
    user_id = await _current_user_id(request)
    stock = market_state.get_stock(symbol)
    ltp = stock["ltp"] if stock else 0.0
    balance = 0.0
    if _pool is not None:
        async with _pool.acquire() as conn:
            wallet = await conn.fetchrow(
                "select balance from public.paper_wallets where user_id=$1", user_id,
            )
        balance = float(wallet["balance"]) if wallet else 0.0
    return {
        "ltp": ltp,
        "available_balance": balance,
        "max_qty": paper_margin.max_affordable_qty(balance, ltp),
        "leverage": paper_margin.INTRADAY_LEVERAGE,
    }


def _validate_tsl(tsl_type: str | None, tsl_value: float | None) -> None:
    if tsl_type is None:
        return
    if tsl_type not in ("PERCENT", "POINTS"):
        raise HTTPException(status_code=400, detail="tsl_type must be PERCENT or POINTS")
    if not tsl_value or tsl_value <= 0:
        raise HTTPException(status_code=400, detail="tsl_value is required when tsl_type is set")


@router.post("/orders")
async def place_order(body: PlaceOrderBody, request: Request):
    user_id = await _current_user_id(request)
    if body.side not in ("BUY", "SELL"):
        raise HTTPException(status_code=400, detail="side must be BUY or SELL")
    if body.order_type not in ("MARKET", "LIMIT"):
        raise HTTPException(status_code=400, detail="order_type must be MARKET or LIMIT")
    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity must be positive")
    _validate_tsl(body.tsl_type, body.tsl_value)

    stock = market_state.get_stock(body.symbol)
    if stock is None:
        raise HTTPException(status_code=404, detail="unknown symbol")
    ltp = stock["ltp"]
    if not ltp:
        raise HTTPException(status_code=409, detail="no live price yet for this symbol")

    pool = _require_pool()

    if body.order_type == "LIMIT":
        if not body.limit_price or body.limit_price <= 0:
            raise HTTPException(status_code=400, detail="limit_price is required for LIMIT orders")
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "insert into public.paper_orders "
                "(user_id, symbol, side, quantity, order_type, limit_price, sl_price, target_price, "
                "tsl_type, tsl_value, status) "
                "values ($1,$2,$3,$4,'LIMIT',$5,$6,$7,$8,$9,'PENDING') returning *",
                user_id, body.symbol, body.side, body.quantity, body.limit_price,
                body.sl_price, body.target_price, body.tsl_type, body.tsl_value,
            )
        order_monitor.register_pending_limit(dict(row))
        return _serialize(dict(row))

    # MARKET: fills immediately at the live LTP.
    margin = paper_margin.required_margin(ltp, body.quantity)
    peak_price = ltp if body.tsl_type else None
    async with pool.acquire() as conn:
        async with conn.transaction():
            wallet = await conn.fetchrow(
                "select balance from public.paper_wallets where user_id=$1 for update", user_id,
            )
            if wallet is None or float(wallet["balance"]) < margin:
                raise HTTPException(status_code=400, detail="insufficient margin")
            await conn.execute(
                "update public.paper_wallets set balance = balance - $1, updated_at = now() "
                "where user_id = $2",
                margin, user_id,
            )
            row = await conn.fetchrow(
                "insert into public.paper_orders "
                "(user_id, symbol, side, quantity, order_type, sl_price, target_price, "
                "tsl_type, tsl_value, peak_price, entry_price, margin_locked, status, filled_at) "
                "values ($1,$2,$3,$4,'MARKET',$5,$6,$7,$8,$9,$10,$11,'OPEN', now()) returning *",
                user_id, body.symbol, body.side, body.quantity, body.sl_price,
                body.target_price, body.tsl_type, body.tsl_value, peak_price, ltp, margin,
            )
    if body.sl_price or body.target_price or body.tsl_type:
        order_monitor.register_open_bracket(dict(row))
    return _serialize(dict(row))


@router.post("/orders/{order_id}/modify")
async def modify_position(order_id: int, body: ModifyPositionBody, request: Request):
    """Full-replace the bracket on an OPEN position: SL, Target, and/or TSL.
    The client always sends the complete desired state (the edit UI pre-fills
    current values) — there's no partial-patch semantics here."""
    user_id = await _current_user_id(request)
    _validate_tsl(body.tsl_type, body.tsl_value)
    pool = _require_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select * from public.paper_orders where id=$1 and user_id=$2 and status='OPEN'",
            order_id, user_id,
        )
        if row is None:
            raise HTTPException(status_code=404, detail="position not found")

        # Trailing should start fresh from "now" whenever TSL is (re)configured,
        # not from the original entry price — the intuitive behavior when a
        # trader adds/changes a TSL mid-trade.
        if body.tsl_type:
            stock = market_state.get_stock(row["symbol"])
            new_peak = stock["ltp"] if stock and stock["ltp"] else float(row["entry_price"])
        else:
            new_peak = None

        updated = await conn.fetchrow(
            "update public.paper_orders set sl_price=$1, target_price=$2, tsl_type=$3, "
            "tsl_value=$4, peak_price=$5 where id=$6 returning *",
            body.sl_price, body.target_price, body.tsl_type, body.tsl_value, new_peak, order_id,
        )
    order_monitor.unregister(order_id, row["symbol"])
    order_monitor.register_open_bracket(dict(updated))
    return _serialize(dict(updated))


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: int, request: Request):
    user_id = await _current_user_id(request)
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "update public.paper_orders set status='CANCELLED' "
            "where id=$1 and user_id=$2 and status='PENDING' returning *",
            order_id, user_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="order not found or not cancellable")
    order_monitor.unregister(order_id, row["symbol"])
    return _serialize(dict(row))


@router.post("/orders/{order_id}/close")
async def close_position(order_id: int, request: Request):
    user_id = await _current_user_id(request)
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select symbol from public.paper_orders where id=$1 and user_id=$2 and status='OPEN'",
            order_id, user_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="position not found")
    stock = market_state.get_stock(row["symbol"])
    ltp = stock["ltp"] if stock else None
    if not ltp:
        raise HTTPException(status_code=409, detail="no live price available to close at")
    result = await close_order(order_id, user_id, "MANUAL", ltp)
    if result is None:
        raise HTTPException(status_code=404, detail="position not found")
    return result


@router.get("/positions")
async def positions(request: Request):
    user_id = await _current_user_id(request)
    if _pool is None:
        return {"positions": []}
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "select * from public.paper_orders where user_id=$1 and status in ('OPEN','PENDING') "
            "order by placed_at desc",
            user_id,
        )
    out = []
    for r in rows:
        d = _serialize(dict(r))
        if d["status"] == "OPEN":
            stock = market_state.get_stock(d["symbol"])
            ltp = stock["ltp"] if stock else None
            d["ltp"] = ltp
            d["unrealized_pnl"] = (
                paper_pnl.unrealized_pnl(d["side"], d["quantity"], d["entry_price"], ltp)
                if ltp else None
            )
        else:
            d["ltp"] = None
            d["unrealized_pnl"] = None
        out.append(d)
    return {"positions": out}


@router.get("/orders/history")
async def history(request: Request, limit: int = 50, offset: int = 0):
    user_id = await _current_user_id(request)
    if _pool is None:
        return {"orders": []}
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "select * from public.paper_orders where user_id=$1 and status in ('CLOSED','CANCELLED') "
            "order by placed_at desc limit $2 offset $3",
            user_id, limit, offset,
        )
    return {"orders": [_serialize(dict(r)) for r in rows]}


@router.get("/pnl/summary")
async def pnl_summary(request: Request):
    user_id = await _current_user_id(request)
    pool = _require_pool()
    async with pool.acquire() as conn:
        wallet = await conn.fetchrow(
            "select balance from public.paper_wallets where user_id=$1", user_id,
        )
        realized = await conn.fetchrow(
            "select coalesce(sum(realized_pnl),0) as total, count(*) as n "
            "from public.paper_orders where user_id=$1 and status='CLOSED'",
            user_id,
        )
        open_rows = await conn.fetch(
            "select symbol, side, quantity, entry_price from public.paper_orders "
            "where user_id=$1 and status='OPEN'",
            user_id,
        )
    unrealized_total = 0.0
    for r in open_rows:
        stock = market_state.get_stock(r["symbol"])
        if stock and stock["ltp"]:
            unrealized_total += paper_pnl.unrealized_pnl(
                r["side"], r["quantity"], float(r["entry_price"]), stock["ltp"]
            )
    balance = float(wallet["balance"]) if wallet else 0.0
    realized_total = float(realized["total"]) if realized else 0.0
    return {
        "balance": balance,
        "realized_pnl": realized_total,
        "unrealized_pnl": round(unrealized_total, 2),
        "total_pnl": round(realized_total + unrealized_total, 2),
        "open_count": len(open_rows),
        "closed_count": realized["n"] if realized else 0,
    }
