"""
FYERS data plane:

  * REST backfill  — seeds prev-close, yesterday's high/low, today's ORB
                     candle boundaries and an initial LTP snapshot so the
                     dashboard is fully populated even when opened mid-session.
  * WebSocket feed — ingests live ticks and funnels them through the math
                     engine. Lifecycle (start/stop) is controlled by the
                     scheduler for market-hours gating.
"""

import time
from datetime import datetime, timedelta
from datetime import time as dt_time

from fyers_apiv3 import fyersModel
from fyers_apiv3.FyersWebsocket import data_ws

from . import config
from .calculations import has_two_sided_range, process_incoming_tick
from .config import (ALL_SYMBOLS, BENCHMARK_SYMBOL, IST, ORB_CANDLES,
                     WATCHLIST, short_symbol)
from .state import market_state


class DataEngine:
    def __init__(self):
        self.access_token: str | None = None
        self.rest: fyersModel.FyersModel | None = None
        self.ws: data_ws.FyersDataSocket | None = None
        self._running = False
        # Symbols confirmed subscribable; a single bad ticker otherwise drops
        # the whole websocket, so we validate before subscribing.
        self.valid_symbols: list[str] = list(ALL_SYMBOLS)

    # ---------------- lifecycle ----------------
    def set_token(self, token: str):
        self.access_token = token
        self.rest = fyersModel.FyersModel(
            client_id=config.CLIENT_ID, token=token, is_async=False, log_path=""
        )

    @property
    def running(self) -> bool:
        return self._running

    # ---------------- REST helper (retry/backoff for rate limits) ----------------
    # Error codes that will never succeed on retry — bail immediately instead of
    # burning the rate limit on every symbol (a permission error on one call means
    # every subsequent call fails identically; retrying 170x3 times starved out a
    # perfectly good quotes() call that ran right after and rate-limited it too).
    _NON_RETRYABLE_CODES = {-403}

    def _history_retry(self, params: dict, retries: int = 2):
        for attempt in range(retries + 1):
            try:
                resp = self.rest.history(params)
                if isinstance(resp, dict) and resp.get("s") == "ok":
                    return resp
                if isinstance(resp, dict) and resp.get("code") in self._NON_RETRYABLE_CODES:
                    return resp
                if attempt < retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                return resp
            except Exception:  # noqa: BLE001
                if attempt < retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise

    # ---------------- symbol validation ----------------
    def validate_symbols(self):
        """
        Ping every watchlist symbol via REST quotes and keep only those FYERS
        recognises. Prevents a single delisted/renamed ticker (e.g. after a
        demerger) from tearing down the entire websocket subscription.
        """
        if not self.rest:
            return self.valid_symbols

        ok = set()
        errored = set()
        for i in range(0, len(ALL_SYMBOLS), 50):
            batch = ALL_SYMBOLS[i : i + 50]
            try:
                resp = self.rest.quotes({"symbols": ",".join(batch)})
                for entry in resp.get("d", []) if isinstance(resp, dict) else []:
                    sym = entry.get("n")
                    if not sym:
                        continue
                    if entry.get("s") == "ok" and entry.get("v"):
                        ok.add(sym)
                    else:
                        errored.add(sym)
            except Exception as exc:  # noqa: BLE001
                print(f"[validate] quotes batch failed: {exc}")

        if not ok:
            # Validation couldn't run (e.g. quotes API error) — don't strip
            # everything; keep the full list rather than subscribe to nothing.
            print("[validate] could not validate any symbol; keeping full list.")
            self.valid_symbols = list(ALL_SYMBOLS)
            return self.valid_symbols

        self.valid_symbols = [s for s in ALL_SYMBOLS if s in ok]
        dropped = [s for s in ALL_SYMBOLS if s not in ok]
        if dropped:
            print(f"[validate] dropping {len(dropped)} invalid symbol(s): {dropped}")
        print(f"[validate] {len(self.valid_symbols)}/{len(ALL_SYMBOLS)} symbols valid.")
        return self.valid_symbols

    # ---------------- REST backfill ----------------
    def backfill(self):
        if not self.rest:
            print("[backfill] No REST client (not authenticated); skipping.")
            return
        print("[backfill] Seeding prev-close, ranges and ORB boundaries ...")
        self.validate_symbols()
        self._backfill_prev_day()
        self._backfill_today_orb()
        self._backfill_orb_quality()
        self._backfill_quotes()
        print("[backfill] Done.")

    def _backfill_prev_day(self):
        """Daily candles -> previous trading day's high/low/close for each symbol."""
        today = datetime.now(IST).date()
        rng_from = (today - timedelta(days=12)).strftime("%Y-%m-%d")
        rng_to = today.strftime("%Y-%m-%d")
        warned = False

        for fy_symbol in ALL_SYMBOLS:
            try:
                time.sleep(0.05)  # gentle pacing against REST rate limits
                resp = self._history_retry(
                    {
                        "symbol": fy_symbol,
                        "resolution": "D",
                        "date_format": "1",
                        "range_from": rng_from,
                        "range_to": rng_to,
                        "cont_flag": "1",
                    }
                )
                if isinstance(resp, dict) and resp.get("code") in self._NON_RETRYABLE_CODES:
                    # App-level (not symbol-level) error — every remaining symbol
                    # would fail identically, so stop instead of wasting the rest
                    # of the rate-limit budget on calls that can't succeed.
                    print(f"[backfill] prev-day history() unavailable, aborting rest of pass: {resp}")
                    return
                if isinstance(resp, dict) and resp.get("s") == "error":
                    if not warned:
                        print(f"[backfill] prev-day history() error (will repeat per-symbol, "
                              f"only logging once): {resp}")
                        warned = True
                    continue
                candles = resp.get("candles", []) if isinstance(resp, dict) else []
                if not candles:
                    continue
                # Drop today's forming candle if present; take the last completed day.
                completed = [c for c in candles if datetime.fromtimestamp(c[0], IST).date() < today]
                prev = completed[-1] if completed else candles[-1]
                _ts, _o, high, low, close, *_ = prev

                if fy_symbol == BENCHMARK_SYMBOL:
                    market_state.set_nifty(prev_close=close, ltp=close)
                    continue

                sym = short_symbol(fy_symbol)
                with market_state.lock():
                    stock = market_state.get_stock(sym)
                    if stock:
                        stock["prev_close"] = close
                        stock["yesterday_high"] = high
                        stock["yesterday_low"] = low
                        # Baseline so pre-market rows show yesterday's close (not
                        # 0.00) until quotes / live ticks arrive; overwritten later.
                        if not stock["ltp"]:
                            stock["ltp"] = close
                        if not stock["today_high"]:
                            stock["today_high"] = close
                        if not stock["today_low"]:
                            stock["today_low"] = close
            except Exception as exc:  # noqa: BLE001
                print(f"[backfill] prev-day failed for {fy_symbol}: {exc}")

    def _backfill_today_orb(self):
        """30-min candles for today -> C1..C4 high/low boundaries + today's range."""
        now = datetime.now(IST)
        if now.weekday() >= 5:
            # Weekend: no session happened "today" — every symbol would fail every
            # retry for nothing, turning startup into a multi-minute wait.
            print("[backfill] Weekend — skipping today's ORB backfill (no session data exists).")
            return
        today = now.date()
        day = today.strftime("%Y-%m-%d")
        # Map candle start-time -> ORB name for quick lookup.
        start_to_name = {start: name for name, start, _end in ORB_CANDLES}
        warned = False

        for fy_symbol in WATCHLIST:  # ORB only applies to equities, not the index
            try:
                time.sleep(0.05)  # gentle pacing against REST rate limits
                resp = self._history_retry(
                    {
                        "symbol": fy_symbol,
                        "resolution": "30",
                        "date_format": "1",
                        "range_from": day,
                        "range_to": day,
                        "cont_flag": "1",
                    }
                )
                if isinstance(resp, dict) and resp.get("code") in self._NON_RETRYABLE_CODES:
                    print(f"[backfill] ORB history() unavailable, aborting rest of pass: {resp}")
                    return
                if isinstance(resp, dict) and resp.get("s") == "error":
                    if not warned:
                        print(f"[backfill] ORB history() error (will repeat per-symbol, "
                              f"only logging once): {resp}")
                        warned = True
                    continue
                candles = resp.get("candles", []) if isinstance(resp, dict) else []
                if not candles:
                    continue

                sym = short_symbol(fy_symbol)
                day_high = max(c[2] for c in candles)
                day_low = min(c[3] for c in candles)
                orb = {}
                for ts, _o, high, low, _c, *_ in candles:
                    candle_start = datetime.fromtimestamp(ts, IST).time()
                    name = start_to_name.get(candle_start)
                    if name:
                        orb[name] = {"high": high, "low": low}

                with market_state.lock():
                    stock = market_state.get_stock(sym)
                    if stock:
                        stock["orb"] = orb
                        stock["today_high"] = day_high
                        stock["today_low"] = day_low
            except Exception as exc:  # noqa: BLE001
                print(f"[backfill] ORB failed for {fy_symbol}: {exc}")

    def _backfill_orb_quality(self):
        """
        Seed the breakout-quality reference data from 9:15-9:45 5-min candles,
        run once the opening range has fully elapsed (scheduled ~09:46 IST):
          - candle1_high/candle1_low: the day's-extreme reference used live by
            calculations.first_candle_extreme_intact() on every subsequent tick.
          - two_sided_ok: calculations.has_two_sided_range() over the six candles.
        Together with the live day-high/low these gate "Bull/Bear • C1" so the
        Ranking screen's breakout filter only ever shows qualifying stocks.
        """
        now = datetime.now(IST)
        if now.weekday() >= 5:
            print("[backfill] Weekend — skipping ORB quality check (no session data exists).")
            return
        day = now.date().strftime("%Y-%m-%d")
        c1_start, c1_end = ORB_CANDLES[0][1], ORB_CANDLES[0][2]

        for fy_symbol in WATCHLIST:
            try:
                time.sleep(0.05)  # gentle pacing against REST rate limits
                resp = self._history_retry(
                    {
                        "symbol": fy_symbol,
                        "resolution": "5",
                        "date_format": "1",
                        "range_from": day,
                        "range_to": day,
                        "cont_flag": "1",
                    }
                )
                if isinstance(resp, dict) and resp.get("code") in self._NON_RETRYABLE_CODES:
                    print(f"[backfill] ORB-quality history() unavailable, aborting rest of pass: {resp}")
                    return
                candles = resp.get("candles", []) if isinstance(resp, dict) else []
                opening = sorted(
                    (c for c in candles if c1_start <= datetime.fromtimestamp(c[0], IST).time() < c1_end),
                    key=lambda c: c[0],
                )

                sym = short_symbol(fy_symbol)
                with market_state.lock():
                    stock = market_state.get_stock(sym)
                    if stock:
                        stock["two_sided_ok"] = has_two_sided_range(opening)
                        if opening:
                            stock["candle1_high"] = opening[0][2]
                            stock["candle1_low"] = opening[0][3]
            except Exception as exc:  # noqa: BLE001
                print(f"[backfill] ORB-quality failed for {fy_symbol}: {exc}")

    def _backfill_quotes(self):
        """Seed a current LTP snapshot in batches so rows aren't blank pre-tick."""
        symbols = ALL_SYMBOLS
        for i in range(0, len(symbols), 50):
            batch = symbols[i : i + 50]
            try:
                resp = self.rest.quotes({"symbols": ",".join(batch)})
                if isinstance(resp, dict) and resp.get("s") == "error":
                    print(f"[backfill] quotes batch error: {resp}")
                    continue
                for entry in resp.get("d", []):
                    v = entry.get("v", {})
                    fy_symbol = entry.get("n") or v.get("symbol", "")
                    ltp = v.get("lp") or v.get("ltp")
                    if not ltp:
                        continue
                    if fy_symbol == BENCHMARK_SYMBOL:
                        market_state.set_nifty(ltp=ltp)
                        continue
                    process_incoming_tick(
                        market_state,
                        short_symbol(fy_symbol),
                        ltp,
                        v.get("high_price", 0) or 0,
                        v.get("low_price", 0) or 0,
                        volume=v.get("volume") or v.get("vol_traded_today") or 0,
                        upper_ckt=v.get("upper_ckt") or 0,
                        lower_ckt=v.get("lower_ckt") or 0,
                        tot_buy_qty=v.get("tot_buy_qty") or 0,
                        tot_sell_qty=v.get("tot_sell_qty") or 0,
                    )
            except Exception as exc:  # noqa: BLE001
                print(f"[backfill] quotes batch failed: {exc}")

    # ---------------- WebSocket feed ----------------
    def start_websocket(self):
        if not self.access_token:
            print("[ws] No access token; websocket not started.")
            return
        if self._running:
            return

        def on_message(msg):
            try:
                self._handle_tick(msg)
            except Exception as exc:  # noqa: BLE001
                print(f"[ws] tick handler error: {exc}")

        def on_open():
            symbols = self.valid_symbols or ALL_SYMBOLS
            print(f"[ws] subscribing to {len(symbols)} symbols ...")
            self.ws.subscribe(symbols=symbols, data_type="SymbolUpdate")
            self.ws.keep_running()

        def on_error(msg):
            print(f"[ws] error: {msg}")

        def on_close(msg):
            print(f"[ws] closed: {msg}")
            self._running = False

        self.ws = data_ws.FyersDataSocket(
            access_token=f"{config.CLIENT_ID}:{self.access_token}",
            log_path="",
            litemode=False,
            write_to_file=False,
            reconnect=True,
            on_connect=on_open,
            on_close=on_close,
            on_error=on_error,
            on_message=on_message,
        )
        self._running = True
        print("[ws] Connecting to Fyers data socket ...")
        self.ws.connect()  # blocking; run this inside a background thread

    def stop_websocket(self):
        if self.ws and self._running:
            try:
                self.ws.close_connection()
            except Exception as exc:  # noqa: BLE001
                print(f"[ws] close error: {exc}")
        self._running = False

    def _handle_tick(self, msg: dict):
        # Fyers SymbolUpdate messages vary slightly by version; read defensively.
        fy_symbol = msg.get("symbol")
        if not fy_symbol:
            return
        ltp = msg.get("ltp") or msg.get("last_traded_price")
        if ltp is None:
            return
        high = msg.get("high_price") or msg.get("high") or 0
        low = msg.get("low_price") or msg.get("low") or 0
        prev_close = msg.get("prev_close_price") or msg.get("prev_close") or 0
        volume = msg.get("vol_traded_today") or msg.get("volume") or 0
        upper_ckt = msg.get("upper_ckt") or 0
        lower_ckt = msg.get("lower_ckt") or 0
        tot_buy_qty = msg.get("tot_buy_qty") or 0
        tot_sell_qty = msg.get("tot_sell_qty") or 0

        if fy_symbol == BENCHMARK_SYMBOL:
            market_state.set_nifty(ltp=ltp, prev_close=prev_close or None)
            return
        process_incoming_tick(
            market_state,
            short_symbol(fy_symbol),
            ltp,
            high,
            low,
            prev_close,
            volume,
            upper_ckt,
            lower_ckt,
            tot_buy_qty,
            tot_sell_qty,
        )


data_engine = DataEngine()
