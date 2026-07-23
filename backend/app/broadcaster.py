"""
Real-time streaming layer.

  * `snapshot_from_state`  reads the shared MarketState under lock and returns
                           a plain-dict snapshot suitable for diffing/serializing.
  * `build_frame`          pure differ: given previous and current snapshots,
                           returns a snapshot frame, a delta frame, or None.

The `Broadcaster` class defined below drives these on a fixed cadence and fans
each frame out to connected WebSocket subscribers.
"""
import asyncio
import json
from typing import Callable, Optional

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
            "fyers_connected": False,  # patched to the live auth flag by _live_snapshot() in main.py
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


class Broadcaster:
    """
    Ticks on a fixed interval, builds one frame per tick, and fans that
    single serialized string out to every subscribed WebSocket via bounded
    asyncio.Queues. Slow subscribers are silently resynced (drain + snapshot).
    """

    def __init__(self, snapshot_provider: Callable[[], dict],
                 interval: float = 0.25, max_queue: int = 8,
                 heartbeat_secs: float = 5.0):
        self._provider = snapshot_provider
        self._interval = interval
        self._max_queue = max_queue
        self._heartbeat_ticks = max(1, int(heartbeat_secs / interval))
        self._quiet_ticks: int = 0
        self._task: asyncio.Task | None = None
        self._prev: dict | None = None
        self._seq: int = 0
        # Each subscriber = (queue, needs_snapshot_flag)
        self._subs: dict[asyncio.Queue, bool] = {}

    # ---- lifecycle ----
    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run(), name="broadcaster")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001
            print(f"[broadcaster] task exited abnormally: {exc!r}")
        self._task = None

    # ---- subscription ----
    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._max_queue)
        self._subs[q] = True  # needs snapshot on next frame
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs.pop(q, None)

    def mark_resync(self, q: asyncio.Queue) -> None:
        if q in self._subs:
            self._subs[q] = True

    # ---- tick loop ----
    async def _run(self) -> None:
        try:
            while True:
                try:
                    await self._tick_once()
                except Exception as exc:  # noqa: BLE001
                    print(f"[broadcaster] tick error (continuing): {exc!r}")
                await asyncio.sleep(self._interval)
        except asyncio.CancelledError:
            return

    async def _tick_once(self) -> None:
        curr = self._provider()
        # Advance seq only when we actually emit; keep it monotonic per emission.
        # But the frame needs the seq BEFORE we know if we'll emit — so peek.
        next_seq = self._seq + 1
        frame = build_frame(self._prev, curr, seq=next_seq)
        needs_resync = [q for q, flag in self._subs.items() if flag]

        # Nothing changed AND no one needs a forced snapshot → maybe heartbeat.
        if frame is None and not needs_resync:
            self._quiet_ticks += 1
            if self._quiet_ticks >= self._heartbeat_ticks:
                self._quiet_ticks = 0
                hb_msg = json.dumps({"type": "heartbeat", "seq": self._seq},
                                    separators=(",", ":"))
                for q in list(self._subs):
                    try:
                        q.put_nowait(hb_msg)
                    except asyncio.QueueFull:
                        # Drain and resnapshot the slow client.
                        while not q.empty():
                            try:
                                q.get_nowait()
                            except asyncio.QueueEmpty:
                                break
                        fresh = json.dumps(
                            build_frame(None, curr, seq=self._seq, force_snapshot=True),
                            separators=(",", ":"),
                        )
                        try:
                            q.put_nowait(fresh)
                            self._subs[q] = False
                        except asyncio.QueueFull:
                            pass
            return

        # A real frame (delta, snapshot, or forced resync) resets the quiet counter.
        self._quiet_ticks = 0

        # Build the two possible payloads: regular delta/snapshot and forced snapshot.
        payload: str | None = None
        snapshot_payload: str | None = None
        if frame is not None:
            self._seq = next_seq
            self._prev = curr
            payload = json.dumps(frame, separators=(",", ":"))
        if needs_resync:
            # Forced snapshot always uses the current seq (either the one we
            # just bumped for the delta above, or a fresh one if there was no delta).
            # seq is monotonic per SUBSCRIBER (each client tracks its own lastSeq).
            # When both a delta and a forced snapshot are emitted in the same tick they
            # may share a seq value — that's fine because no subscriber receives both.
            snap_seq = self._seq if frame is not None else next_seq
            if frame is None:
                self._seq = snap_seq
                self._prev = curr
            snap_frame = build_frame(None, curr, seq=snap_seq, force_snapshot=True)
            snapshot_payload = json.dumps(snap_frame, separators=(",", ":"))

        for q, flag in list(self._subs.items()):
            msg = snapshot_payload if flag else payload
            if msg is None:
                continue
            try:
                q.put_nowait(msg)
                if flag:
                    self._subs[q] = False
            except asyncio.QueueFull:
                # Slow client → drop everything in the queue and give it a
                # snapshot so it re-converges silently.
                while not q.empty():
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                fresh = snapshot_payload or json.dumps(
                    build_frame(None, curr, seq=self._seq, force_snapshot=True),
                    separators=(",", ":"),
                )
                try:
                    q.put_nowait(fresh)
                    self._subs[q] = False
                except asyncio.QueueFull:
                    # Should be impossible right after drain; if it happens
                    # the subscriber's consumer is truly dead — leave it.
                    pass
