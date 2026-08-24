"""
Fyers DepthUpdate WebSocket manager.

Runs a second, dedicated WebSocket that streams 5-level bid/ask order-book
snapshots for the top-N most active symbols, dynamically selected every 2
minutes from live market state.

Design notes
============
* A separate socket is required because Fyers does not support mixing
  SymbolUpdate and DepthUpdate on the same connection.
* Message volume for DepthUpdate is much higher than SymbolUpdate
  (order-book changes, not just trades). DEPTH_TOP_N is intentionally
  capped at 10 to keep the Oracle Ampere VM comfortable; raise it after
  observing CPU during 09:15-10:00 on the first live day.
* `depth_delta` written to market_state is a point-in-time snapshot
  (bid_value - ask_value) updated on every depth message. It is broadcast
  to the frontend via the existing SSE stream.
* The `delta` column in candle_history is NOT changed by this module —
  that column accumulates tick-rule delta (in traded shares). Mixing it
  with book-imbalance values (in rupee-value) in the same column would
  make the numbers incomparable across symbols. They are kept separate
  intentionally; a dedicated DB column can be added in a future pass.
* Thread safety: _last_book and _depth_set are always accessed under
  _lock. Dict .get() / assignment in CPython is GIL-atomic, but the
  paired read-then-write in resubscribe() is not, hence the lock.
"""

import logging
import threading
from typing import Optional

from fyers_apiv3.FyersWebsocket import data_ws

from . import config, order_monitor
from .config import CLIENT_ID
from .config import short_symbol as _short_symbol

logger = logging.getLogger(__name__)

# Maximum symbols subscribed to DepthUpdate at any time.
# Start conservative; raise to 20-25 once VM load is confirmed acceptable.
DEPTH_TOP_N: int = 10

# ── internal state (all guarded by _lock) ────────────────────────────────────
_lock = threading.Lock()
_ws: Optional[data_ws.FyersDataSocket] = None
_running: bool = False
_depth_set: set[str] = set()  # short symbols currently subscribed
_last_book: dict[str, tuple[float, float]] = {}  # sym → (bid_val, ask_val)

# Symbols that returned -300 'invalid symbol' on DepthUpdate subscription —
# permanently excluded for the lifetime of the process so they don't keep
# breaking the whole 2-minute rotation window for all other depth symbols.
_depth_blacklist: set[str] = set()

# Short symbols we tried to subscribe in the most recent resubscribe() call;
# stored so the on_error(-300) handler in fyers_service.py can identify and
# blacklist the bad ticker(s) without needing to diff the message itself
# (Fyers doesn't tell us which symbol triggered the -300).
_last_subscribe_attempt: set[str] = set()

# Logged once on the very first depth message to confirm actual Fyers field
# names before processing begins — makes field-name mismatches easy to spot.
_first_message_logged: bool = False


# ── public API ────────────────────────────────────────────────────────────────


def get_book_delta(sym: str) -> Optional[float]:
    """
    Return (bid_value − ask_value) from the latest DepthUpdate snapshot for
    *sym*, or ``None`` if the symbol is not currently on the depth subscription.

    bid_value  = Σ(price × quantity) across all bid levels received
    ask_value  = Σ(price × quantity) across all ask levels received
    Positive   → more rupee-value queued on the buy side.
    ``None``   → symbol not subscribed; caller should fall back to tick-rule.
    """
    with _lock:
        entry = _last_book.get(sym)
    return (entry[0] - entry[1]) if entry is not None else None


def is_depth_subscribed(sym: str) -> bool:
    """True if *sym* currently has a live DepthUpdate subscription."""
    with _lock:
        return sym in _depth_set


def blacklist_last_attempted() -> None:
    """Called by fyers_service.on_error() when a -300 'invalid symbol' response
    arrives on the WebSocket. Moves every symbol from the most recent
    subscribe attempt into the permanent depth blacklist so they are never
    retried for DepthUpdate this session.

    Because Fyers does not identify *which* symbol triggered the error, we
    conservatively blacklist the whole attempt set. In practice each rotation
    adds 1-4 new symbols, so false positives are low and still recoverable on
    the next process restart.
    """
    with _lock:
        bad = set(_last_subscribe_attempt)
        _last_subscribe_attempt.clear()
    if bad:
        _depth_blacklist.update(bad)
        logger.warning(
            "depth: blacklisting %d symbol(s) that caused -300 DepthUpdate error: %s",
            len(bad),
            sorted(bad),
        )


# ── depth message handler ─────────────────────────────────────────────────────


def _on_depth_message(msg: dict) -> None:
    global _first_message_logged

    if not _first_message_logged:
        logger.info("depth_manager: first raw depth message (field-name audit): %s", msg)
        _first_message_logged = True

    fy_sym = msg.get("symbol") or msg.get("sym") or ""
    if not fy_sym:
        return

    sym = _short_symbol(fy_sym)

    # Fyers sends bids/asks as a list of level dicts.  Field names confirmed
    # from the logged first message; fallbacks cover minor API version drift.
    bids = msg.get("bids") or msg.get("bid") or []
    asks = msg.get("asks") or msg.get("ask") or []

    bid_val = 0.0
    for b in bids:
        p = b.get("price") or b.get("lp") or 0
        q = b.get("quantity") or b.get("qty") or b.get("vol") or 0
        bid_val += float(p) * float(q)

    ask_val = 0.0
    for a in asks:
        p = a.get("price") or a.get("lp") or 0
        q = a.get("quantity") or a.get("qty") or a.get("vol") or 0
        ask_val += float(p) * float(q)

    with _lock:
        _last_book[sym] = (bid_val, ask_val)

    # Write live snapshot into market_state so the existing SSE broadcaster
    # carries depth_delta to the frontend with zero extra plumbing.
    from .state import market_state

    with market_state.lock():
        stock = market_state.get_stock(sym)
        if stock is not None:
            stock["depth_delta"] = round(bid_val - ask_val, 0)


# ── symbol scoring ────────────────────────────────────────────────────────────


def _score_symbol(stock: dict, forced_syms: set[str]) -> float:
    """
    Composite priority score for a single stock derived entirely from live
    market_state — no external data needed.

      +200  symbol has an open or pending paper position (forced inclusion)
      +100  ORB breakout signal currently active
      +0-∞  |pct_change| × 5   — stock is moving
      +0-∞  |relative_strength| × 3  — leading/lagging NIFTY strongly
      +0-20 extreme queue imbalance (tot_buy_qty vs tot_sell_qty ratio)
    """
    score = 0.0
    sym = stock["symbol"]

    if sym in forced_syms:
        score += 200.0

    if stock.get("signal", "None") != "None":
        score += 100.0

    score += abs(stock.get("pct_change", 0.0)) * 5.0
    score += abs(stock.get("relative_strength", 0.0)) * 3.0

    tbq = stock.get("tot_buy_qty") or 0
    tsq = stock.get("tot_sell_qty") or 0
    total_q = tbq + tsq
    if total_q > 0:
        ratio = tbq / total_q
        # abs(ratio - 0.5) ranges 0→0.5; scale to 0→20 pts
        score += abs(ratio - 0.5) * 40.0

    return score


def _select_top_symbols(n: int) -> set[str]:
    """
    Score every tracked symbol against live state and return the top-n short
    symbols. Symbols with open paper positions are forced to score highest so
    they are never rotated out while a trade is live.
    """
    from .state import market_state

    # Paper positions forced in (open brackets + pending limits).
    forced = set(order_monitor._open_brackets.keys()) | set(order_monitor._pending_limits.keys())

    with market_state.lock():
        stocks = list(market_state.stocks.values())

    scored = [(s["symbol"], _score_symbol(s, forced)) for s in stocks]
    scored.sort(key=lambda x: x[1], reverse=True)
    return {sym for sym, _ in scored[:n]}


# ── dynamic resubscription ────────────────────────────────────────────────────


def resubscribe() -> None:
    """
    Called every 2 minutes by scheduler.py during market hours.

    Scores all symbols against current state, diffs the result against the
    active subscription set, then issues subscribe / unsubscribe calls on the
    live socket — no reconnection required.
    """
    with _lock:
        if not _running or _ws is None:
            return
        current = set(_depth_set)

    wanted = _select_top_symbols(DEPTH_TOP_N)
    to_add = wanted - current
    to_drop = current - wanted

    if not to_add and not to_drop:
        return  # subscription unchanged

    # Exclude permanently-blacklisted symbols before building the API lists.
    to_add = {s for s in to_add if s not in _depth_blacklist}
    to_drop = {s for s in to_drop if s not in _depth_blacklist}

    if not to_add and not to_drop:
        return  # nothing to change after filtering blacklist

    # Map short symbols → full Fyers symbols for the API call.
    from .state import market_state

    with market_state.lock():
        fy_map = {s["symbol"]: s["fy_symbol"] for s in market_state.stocks.values()}

    fy_to_drop = [fy_map[s] for s in to_drop if s in fy_map]
    fy_to_add = [fy_map[s] for s in to_add if s in fy_map]

    # Unsubscribe dropped symbols in one batch (unsubscribing a bad sym is safe).
    with _lock:
        ws = _ws
    try:
        if fy_to_drop and ws:
            ws.unsubscribe(symbols=fy_to_drop, data_type="DepthUpdate")
    except Exception:
        logger.exception("depth_manager: unsubscribe() failed")

    # Record which symbols we are about to subscribe so that if a -300 error
    # fires in on_error(), blacklist_last_attempted() can identify them.
    with _lock:
        _last_subscribe_attempt.clear()
        _last_subscribe_attempt.update(to_add)

    try:
        if fy_to_add and ws:
            ws.subscribe(symbols=fy_to_add, data_type="DepthUpdate")
        # Success — clear the attempt tracker (no blacklisting needed).
        with _lock:
            _last_subscribe_attempt.clear()
    except Exception:
        logger.exception("depth_manager: subscribe() failed")
        return

    with _lock:
        _depth_set.update(to_add)
        _depth_set.difference_update(to_drop)
        for s in to_drop:
            _last_book.pop(s, None)

    if to_add:
        logger.info("depth: subscribed +%d: %s", len(to_add), sorted(to_add))
    if to_drop:
        logger.info("depth: dropped  -%d: %s", len(to_drop), sorted(to_drop))
        # Clear depth_delta in state for symbols that left the subscription
        # so the frontend shows 0 (not a stale non-zero value).
        from .state import market_state

        with market_state.lock():
            for sym in to_drop:
                stock = market_state.get_stock(sym)
                if stock is not None:
                    stock["depth_delta"] = 0.0


# ── lifecycle ─────────────────────────────────────────────────────────────────


def on_socket_open(ws) -> None:
    """Called from fyers_service.py on_open to subscribe initial top 10 depth symbols."""
    global _ws, _running, _first_message_logged
    with _lock:
        _ws = ws
        _running = True
        _first_message_logged = False

    initial = _select_top_symbols(DEPTH_TOP_N)
    from .state import market_state

    with market_state.lock():
        fy_map = {s["symbol"]: s["fy_symbol"] for s in market_state.stocks.values()}

    fy_syms = [fy_map[s] for s in initial if s in fy_map]
    if fy_syms and ws:
        ws.subscribe(symbols=fy_syms, data_type="DepthUpdate")

    with _lock:
        _depth_set.clear()
        _depth_set.update(initial)

    logger.info(
        "depth_manager: depth subscription on shared socket for %d symbol(s): %s",
        len(initial),
        sorted(initial),
    )


def handle_depth_msg(msg: dict) -> None:
    """Called from fyers_service.py on_message for depth packets."""
    try:
        _on_depth_message(msg)
    except Exception:
        logger.exception("depth_manager: handle_depth_msg error")


def start(token: str) -> None:
    """No-op stub for backwards compatibility; lifecycle managed via shared data_engine ws."""
    global _running
    _running = True


def stop() -> None:
    """Clear depth tracking state on shutdown."""
    global _running, _ws
    with _lock:
        _ws = None
        _running = False
        _depth_set.clear()
        _last_book.clear()
        _depth_blacklist.clear()
        _last_subscribe_attempt.clear()

    try:
        from .state import market_state

        with market_state.lock():
            for s in market_state.stocks.values():
                s["depth_delta"] = 0.0
    except Exception:
        pass


def restart(token: str) -> None:
    """
    Stop the current socket and open a fresh one with an updated token.
    Called by scheduler._daily_login() when the daily TOTP refresh replaces
    the access token (Fyers bakes the token into the WS connection string).
    """
    logger.info("depth_manager: restarting with refreshed token ...")
    stop()
    start(token)
