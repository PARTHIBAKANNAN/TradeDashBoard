"""
Real-time streaming layer.

  * `snapshot_from_state`  reads the shared MarketState under lock and returns
                           a plain-dict snapshot suitable for diffing/serializing.
  * `build_frame`          pure differ: given previous and current snapshots,
                           returns a snapshot frame, a delta frame, or None.

The `Broadcaster` class (see Task 2) drives these on a fixed cadence and fans
each frame out to connected WebSocket subscribers.
"""
from typing import Optional

# Every field the client needs to render a fresh row.
SNAPSHOT_STOCK_FIELDS: tuple[str, ...] = (
    "symbol", "sector",
    "ltp", "pct_change", "relative_strength", "day_range_pos",
    "signal", "signal_time",
    "yesterday_low", "yesterday_high", "today_low", "today_high",
)
# Fields whose values are compared to detect a delta (identity fields excluded).
DIFFABLE_STOCK_FIELDS: tuple[str, ...] = tuple(
    f for f in SNAPSHOT_STOCK_FIELDS if f not in ("symbol", "sector")
)


def snapshot_from_state(market_state) -> dict:
    """Serialize the shared MarketState into a plain-dict frame source."""
    with market_state.lock():
        stocks = {}
        for sym, s in market_state.stocks.items():
            stocks[sym] = {f: s[f] for f in SNAPSHOT_STOCK_FIELDS}
        nifty = dict(market_state.nifty)
        return {
            "market_open": market_state.market_open,
            "fyers_connected": False,  # patched in by main.py where auth module is imported
            "nifty": nifty,
            "stocks": stocks,
        }


def _stock_snapshot_entry(stock: dict) -> dict:
    return {f: stock[f] for f in SNAPSHOT_STOCK_FIELDS}


def _stock_delta_entry(prev: dict, curr: dict) -> Optional[dict]:
    """Return {'symbol': X, ...changed fields} or None if nothing changed."""
    changed = {f: curr[f] for f in DIFFABLE_STOCK_FIELDS if prev.get(f) != curr[f]}
    if not changed:
        return None
    return {"symbol": curr["symbol"], **changed}


def _nifty_delta(prev: dict, curr: dict) -> Optional[dict]:
    changed = {k: v for k, v in curr.items() if prev.get(k) != v}
    return changed or None


def build_frame(prev: Optional[dict], curr: dict, seq: int,
                force_snapshot: bool = False) -> Optional[dict]:
    """
    Diff two snapshots into the smallest wire frame.

    Returns:
      * a 'snapshot' frame on first-connect or force_snapshot
      * a 'delta' frame when anything changed
      * None when nothing changed (caller should send nothing this tick)
    """
    if prev is None or force_snapshot:
        return {
            "type": "snapshot",
            "seq": seq,
            "market_open": curr["market_open"],
            "fyers_connected": curr["fyers_connected"],
            "nifty": dict(curr["nifty"]),
            "stocks": [_stock_snapshot_entry(s) for s in curr["stocks"].values()],
        }

    frame: dict = {"type": "delta", "seq": seq, "stocks": []}

    if prev["market_open"] != curr["market_open"]:
        frame["market_open"] = curr["market_open"]
    if prev["fyers_connected"] != curr["fyers_connected"]:
        frame["fyers_connected"] = curr["fyers_connected"]

    nifty_diff = _nifty_delta(prev["nifty"], curr["nifty"])
    if nifty_diff is not None:
        frame["nifty"] = nifty_diff

    for sym, curr_stock in curr["stocks"].items():
        prev_stock = prev["stocks"].get(sym)
        if prev_stock is None:
            # New symbol → send the whole entry so client can render it fresh.
            frame["stocks"].append(_stock_snapshot_entry(curr_stock))
            continue
        entry = _stock_delta_entry(prev_stock, curr_stock)
        if entry is not None:
            frame["stocks"].append(entry)

    # Anything meaningful in the frame besides type/seq/stocks-empty?
    has_meta = "market_open" in frame or "fyers_connected" in frame or "nifty" in frame
    if not frame["stocks"] and not has_meta:
        return None
    return frame
