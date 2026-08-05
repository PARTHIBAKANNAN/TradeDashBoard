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
import logging
from datetime import datetime
from decimal import Decimal
from io import BytesIO

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel

from . import (brokerage, config, order_monitor, paper_margin, paper_pnl,
               security, telegram_notify)

logger = logging.getLogger(__name__)
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
        logger.info("SUPABASE_DB_URL not set; paper trading disabled.")
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
    logger.info("DB pool ready.")


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
                order_id,
                user_id,
            )
            if row is None:
                return None
            margin = paper_margin.required_margin(ltp, row["quantity"])
            wallet = await conn.fetchrow(
                "select balance from public.paper_wallets where user_id=$1 for update",
                user_id,
            )
            if wallet is None or float(wallet["balance"]) < margin:
                # Balance dropped below what's needed since the order was placed
                # (e.g. margin locked by other fills) — auto-cancel rather than
                # leaving it stuck PENDING forever.
                await conn.execute(
                    "update public.paper_orders set status='CANCELLED' where id=$1",
                    order_id,
                )
                order_monitor.unregister(order_id, row["symbol"])
                return None
            await conn.execute(
                "update public.paper_wallets set balance = balance - $1, updated_at = now() "
                "where user_id = $2",
                margin,
                user_id,
            )
            filled = await conn.fetchrow(
                "update public.paper_orders set status='OPEN', entry_price=$1, margin_locked=$2, "
                "peak_price=case when tsl_type is not null then $1 else peak_price end, "
                "filled_at=now() where id=$3 returning *",
                ltp,
                margin,
                order_id,
            )
    order_monitor.unregister(order_id, row["symbol"])
    order_monitor.register_open_bracket(dict(filled))
    return _serialize(dict(filled))


async def update_trailing_stop(
    order_id: int, user_id: str, sl_price: float, peak_price: float
) -> None:
    """System-driven: called only from order_monitor's tick-driven ratchet, never
    from a user request, so no separate ownership ambiguity beyond the WHERE clause."""
    pool = get_pool()
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            "update public.paper_orders set sl_price=$1, peak_price=$2 "
            "where id=$3 and user_id=$4 and status='OPEN'",
            sl_price,
            peak_price,
            order_id,
            user_id,
        )


_CLOSE_ALERT_EMOJI = {"SL": "🔴", "TARGET": "🟢", "SQUARE_OFF": "🟠"}
_CLOSE_ALERT_LABEL = {"SL": "Stop Loss", "TARGET": "Target", "SQUARE_OFF": "Square-off"}


def _close_alert_text(order: dict) -> str:
    emoji = _CLOSE_ALERT_EMOJI.get(order["close_reason"], "⚪")
    label = _CLOSE_ALERT_LABEL.get(order["close_reason"], order["close_reason"])
    sign = "+" if float(order["net_pnl"]) >= 0 else ""
    return (
        f"{emoji} *{label}*: {order['side']} {order['quantity']} {order['symbol']} "
        f"@ {order['exit_price']} (entry {order['entry_price']})\n"
        f"Gross: {sign}₹{order['realized_pnl']} | Charges: ₹{order['total_charges']} | "
        f"Net: {sign}₹{order['net_pnl']}"
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
                order_id,
                user_id,
            )
            if row is None:
                return None
            pnl = paper_pnl.realized_pnl(
                row["side"], row["quantity"], float(row["entry_price"]), exit_price
            )
            charges = brokerage.compute_charges(
                row["side"], row["quantity"], float(row["entry_price"]), exit_price
            )
            net_pnl = round(pnl - charges["total_charges"], 2)
            credit = float(row["margin_locked"] or 0) + net_pnl
            await conn.execute(
                "update public.paper_wallets set balance = balance + $1, updated_at = now() "
                "where user_id = $2",
                credit,
                user_id,
            )
            closed = await conn.fetchrow(
                "update public.paper_orders set status='CLOSED', close_reason=$1, exit_price=$2, "
                "realized_pnl=$3, brokerage=$4, stt=$5, exchange_charges=$6, sebi_charges=$7, "
                "stamp_duty=$8, gst=$9, total_charges=$10, net_pnl=$11, closed_at=now() "
                "where id=$12 returning *",
                reason,
                exit_price,
                pnl,
                charges["brokerage"],
                charges["stt"],
                charges["exchange_charges"],
                charges["sebi_charges"],
                charges["stamp_duty"],
                charges["gst"],
                charges["total_charges"],
                net_pnl,
                order_id,
            )
    order_monitor.unregister(order_id, row["symbol"])
    result = _serialize(dict(closed))
    if reason in ("SL", "TARGET", "SQUARE_OFF"):
        # Skip MANUAL — the user already knows, they clicked it themselves.
        asyncio.get_running_loop().run_in_executor(
            None, telegram_notify.send_message, _close_alert_text(result)
        )
    return result


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
            await conn.execute(
                "update public.paper_orders set status='CANCELLED' where status='PENDING'"
            )
        for r in pending_rows:
            order_monitor.unregister(r["id"], r["symbol"])
    logger.info(
        "Square-off: closed %d open position(s), cancelled %d pending order(s).",
        closed,
        len(pending_rows),
    )


def square_off_all_sync() -> None:
    """Thread-safe entry point for scheduler.py (runs on APScheduler's worker thread,
    not the asyncio loop the DB pool belongs to)."""
    loop = order_monitor.get_loop()
    if loop is None or _pool is None:
        return
    future = asyncio.run_coroutine_threadsafe(square_off_all(), loop)
    try:
        future.result(timeout=30)
    except Exception:  # noqa: BLE001
        logger.exception("square-off failed")


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
    notes: str | None = None


class ModifyPositionBody(BaseModel):
    sl_price: float | None = None
    target_price: float | None = None
    tsl_type: str | None = None
    tsl_value: float | None = None
    notes: str | None = None


class WalletDepositBody(BaseModel):
    amount: float


DEFAULT_STARTING_BALANCE = 100_000.00


# ---------------- endpoints ----------------
@router.post("/wallet/deposit")
async def deposit_to_wallet(body: WalletDepositBody, request: Request):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")
    user_id = await _current_user_id(request)
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "update public.paper_wallets set balance = balance + $1, updated_at = now() "
            "where user_id = $2 returning balance",
            body.amount,
            user_id,
        )
    return {"balance": float(row["balance"])}


@router.post("/wallet/reset")
async def reset_wallet(request: Request):
    """Resets the balance only — never touches existing orders/positions.
    The frontend confirms first since resetting while positions are open
    leaves margin still locked against the old balance."""
    user_id = await _current_user_id(request)
    pool = _require_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "update public.paper_wallets set balance = $1, updated_at = now() "
            "where user_id = $2 returning balance",
            DEFAULT_STARTING_BALANCE,
            user_id,
        )
    return {"balance": float(row["balance"])}


@router.get("/margin")
async def get_margin(symbol: str, request: Request):
    user_id = await _current_user_id(request)
    stock = market_state.get_stock(symbol)
    ltp = stock["ltp"] if stock else 0.0
    balance = 0.0
    if _pool is not None:
        async with _pool.acquire() as conn:
            wallet = await conn.fetchrow(
                "select balance from public.paper_wallets where user_id=$1",
                user_id,
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
                "tsl_type, tsl_value, notes, status) "
                "values ($1,$2,$3,$4,'LIMIT',$5,$6,$7,$8,$9,$10,'PENDING') returning *",
                user_id,
                body.symbol,
                body.side,
                body.quantity,
                body.limit_price,
                body.sl_price,
                body.target_price,
                body.tsl_type,
                body.tsl_value,
                body.notes,
            )
        order_monitor.register_pending_limit(dict(row))
        return _serialize(dict(row))

    # MARKET: fills immediately at the live LTP.
    margin = paper_margin.required_margin(ltp, body.quantity)
    peak_price = ltp if body.tsl_type else None
    async with pool.acquire() as conn:
        async with conn.transaction():
            wallet = await conn.fetchrow(
                "select balance from public.paper_wallets where user_id=$1 for update",
                user_id,
            )
            if wallet is None or float(wallet["balance"]) < margin:
                raise HTTPException(status_code=400, detail="insufficient margin")
            await conn.execute(
                "update public.paper_wallets set balance = balance - $1, updated_at = now() "
                "where user_id = $2",
                margin,
                user_id,
            )
            row = await conn.fetchrow(
                "insert into public.paper_orders "
                "(user_id, symbol, side, quantity, order_type, sl_price, target_price, "
                "tsl_type, tsl_value, peak_price, entry_price, margin_locked, notes, status, filled_at) "
                "values ($1,$2,$3,$4,'MARKET',$5,$6,$7,$8,$9,$10,$11,$12,'OPEN', now()) returning *",
                user_id,
                body.symbol,
                body.side,
                body.quantity,
                body.sl_price,
                body.target_price,
                body.tsl_type,
                body.tsl_value,
                peak_price,
                ltp,
                margin,
                body.notes,
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
            order_id,
            user_id,
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
            "tsl_value=$4, peak_price=$5, notes=$6 where id=$7 returning *",
            body.sl_price,
            body.target_price,
            body.tsl_type,
            body.tsl_value,
            new_peak,
            body.notes,
            order_id,
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
            order_id,
            user_id,
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
            order_id,
            user_id,
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
                if ltp
                else None
            )
        else:
            d["ltp"] = None
            d["unrealized_pnl"] = None
        out.append(d)
    return {"positions": out}


@router.get("/orders/history")
async def history(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    from_ts: str | None = None,
    to_ts: str | None = None,
):
    """`from_ts`/`to_ts` are optional ISO datetime strings, filtered against
    `placed_at` (chosen over `closed_at` since CANCELLED orders never get a
    closed_at, but every order has placed_at). Preset ranges like "this week"
    are resolved to concrete timestamps on the frontend — this endpoint only
    ever sees plain from/to bounds."""
    user_id = await _current_user_id(request)
    rows = await _fetch_history_rows(user_id, from_ts, to_ts, limit, offset)
    return {"orders": [_serialize(dict(r)) for r in rows]}


# column key -> spreadsheet header label, per export section. Mirrors what
# ExportButtons.jsx used to build client-side as plain CSV — moved server-
# side so real .xlsx files can be generated with openpyxl.
_EXPORT_COLUMNS = {
    "orders": [
        ("symbol", "Symbol"),
        ("side", "Side"),
        ("quantity", "Quantity"),
        ("order_type", "Order Type"),
        ("entry_price", "Entry Price"),
        ("exit_price", "Exit Price"),
        ("close_reason", "Close Reason"),
        ("placed_at", "Placed At"),
        ("closed_at", "Closed At"),
    ],
    "pnl": [
        ("symbol", "Symbol"),
        ("entry_price", "Entry Price"),
        ("exit_price", "Exit Price"),
        ("realized_pnl", "Gross P&L"),
        ("total_charges", "Total Charges"),
        ("net_pnl", "Net P&L"),
    ],
    "tax": [
        ("symbol", "Symbol"),
        ("stt", "STT"),
        ("stamp_duty", "Stamp Duty"),
        ("sebi_charges", "SEBI Charges"),
    ],
    "brokerage": [
        ("symbol", "Symbol"),
        ("brokerage", "Brokerage"),
        ("exchange_charges", "Exchange Charges"),
        ("gst", "GST"),
    ],
    "combined": [
        ("symbol", "Symbol"),
        ("side", "Side"),
        ("quantity", "Quantity"),
        ("order_type", "Order Type"),
        ("entry_price", "Entry Price"),
        ("exit_price", "Exit Price"),
        ("close_reason", "Close Reason"),
        ("realized_pnl", "Gross P&L"),
        ("brokerage", "Brokerage"),
        ("stt", "STT"),
        ("exchange_charges", "Exchange Charges"),
        ("sebi_charges", "SEBI Charges"),
        ("stamp_duty", "Stamp Duty"),
        ("gst", "GST"),
        ("total_charges", "Total Charges"),
        ("net_pnl", "Net P&L"),
        ("notes", "Notes"),
        ("placed_at", "Placed At"),
        ("closed_at", "Closed At"),
    ],
}


@router.get("/orders/export")
async def export_orders(
    request: Request,
    section: str = "combined",
    from_ts: str | None = None,
    to_ts: str | None = None,
):
    if section not in _EXPORT_COLUMNS:
        raise HTTPException(
            status_code=400, detail=f"section must be one of {list(_EXPORT_COLUMNS)}"
        )
    user_id = await _current_user_id(request)
    rows = await _fetch_history_rows(user_id, from_ts, to_ts, limit=10_000, offset=0)
    columns = _EXPORT_COLUMNS[section]

    wb = Workbook()
    ws = wb.active
    ws.title = section.capitalize()
    ws.append([label for _key, label in columns])
    for r in rows:
        row = _serialize(dict(r))
        ws.append([row.get(key) for key, _label in columns])

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    stamp = datetime.now(config.IST).strftime("%Y%m%d")
    filename = f"paper-trading-{section}-{stamp}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _fetch_history_rows(
    user_id: str, from_ts: str | None, to_ts: str | None, limit: int, offset: int
) -> list:
    """Shared by /orders/history (JSON) and /orders/export (.xlsx) so both
    read the exact same date-range-filtered rows via one query, not two."""
    if _pool is None:
        return []
    from_dt = datetime.fromisoformat(from_ts) if from_ts else None
    to_dt = datetime.fromisoformat(to_ts) if to_ts else None
    async with _pool.acquire() as conn:
        return await conn.fetch(
            "select * from public.paper_orders where user_id=$1 and status in ('CLOSED','CANCELLED') "
            "and ($2::timestamptz is null or placed_at >= $2) "
            "and ($3::timestamptz is null or placed_at <= $3) "
            "order by placed_at desc limit $4 offset $5",
            user_id,
            from_dt,
            to_dt,
            limit,
            offset,
        )


@router.get("/pnl/summary")
async def pnl_summary(request: Request):
    user_id = await _current_user_id(request)
    pool = _require_pool()
    async with pool.acquire() as conn:
        wallet = await conn.fetchrow(
            "select balance from public.paper_wallets where user_id=$1",
            user_id,
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
