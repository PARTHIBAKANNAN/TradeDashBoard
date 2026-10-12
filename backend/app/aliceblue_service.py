"""
Alice Blue Data Engine for TradeDashboard / PulseHunter
=========================================================
Ingests live market data from Alice Blue NorenWS WebSocket:
  * Downloads & indexes Alice Blue contract master (NSE.csv).
  * Maps 210 watchlist equities + NIFTY 50 index to Alice Blue instrument tokens.
  * Connects over high-throughput WebSocket (wss://ws1.aliceblueonline.com/NorenWS/).
  * Dispatches real-time ticks into CandleAggregator and MarketState.
"""

import csv
import hashlib
import json
import logging
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

import requests
import websocket

from . import aliceblue_auth, candle_aggregator, config
from .calculations import process_incoming_tick
from .config import ALL_SYMBOLS, BENCHMARK_SYMBOL, IST, WATCHLIST, short_symbol
from .state import market_state

logger = logging.getLogger(__name__)

WS_URL = "wss://ws1.aliceblueonline.com/NorenWS/"
CREATE_WS_SESS_URL = "https://a3.aliceblueonline.com/open-api/od/v1/profile/createWsSess"
NSE_CSV_URL = "https://v2api.aliceblueonline.com/restpy/static/contract_master/NSE.csv"

_BENCHMARK_SHORT_SYMBOL = short_symbol(BENCHMARK_SYMBOL)
NIFTY_TOKEN = 26000


class AliceBlueContractMaster:
    """Manages mapping between TradeDashboard symbols and Alice Blue numeric tokens."""

    def __init__(self):
        self.cache_dir = Path(__file__).resolve().parent.parent / "data"
        self.csv_path = self.cache_dir / "aliceblue_NSE.csv"
        self._symbol_to_token: Dict[str, int] = {}
        self._token_to_symbol: Dict[int, str] = {}
        self._loaded = False
        self._lock = threading.RLock()

    def load_contracts(self) -> bool:
        with self._lock:
            if self._loaded:
                return True

            self.cache_dir.mkdir(parents=True, exist_ok=True)
            if not self.csv_path.exists() or self.csv_path.stat().st_size < 10000:
                logger.info("Downloading Alice Blue NSE contract master...")
                try:
                    resp = requests.get(NSE_CSV_URL, timeout=30)
                    if resp.status_code == 200 and len(resp.content) > 10000:
                        self.csv_path.write_bytes(resp.content)
                        logger.info(
                            "Saved Alice Blue NSE contract master (%d bytes)", len(resp.content)
                        )
                    else:
                        logger.error(
                            "Failed to download Alice Blue NSE master: HTTP %d", resp.status_code
                        )
                        return False
                except Exception as e:
                    logger.error("Exception downloading Alice Blue NSE master: %s", e)
                    return False

            try:
                with open(self.csv_path, mode="r", encoding="utf-8", errors="ignore") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        token_str = row.get("Token", "").strip()
                        sym = row.get("Symbol", "").strip().upper()
                        tsym = row.get("Trading Symbol", "").strip().upper()
                        if not token_str or not token_str.isdigit():
                            continue
                        token_int = int(token_str)

                        # Match exact symbol (e.g. RELIANCE, TCS) or trading symbol (RELIANCE-EQ)
                        clean_sym = sym
                        if clean_sym.endswith("-EQ"):
                            clean_sym = clean_sym[:-3]

                        self._symbol_to_token[clean_sym] = token_int
                        self._token_to_symbol[token_int] = clean_sym

                        # Also index by trading symbol
                        if tsym:
                            tsym_clean = tsym[:-3] if tsym.endswith("-EQ") else tsym
                            self._symbol_to_token[tsym_clean] = token_int

                # Index benchmark
                self._symbol_to_token[_BENCHMARK_SHORT_SYMBOL] = NIFTY_TOKEN
                self._symbol_to_token["NIFTY50"] = NIFTY_TOKEN
                self._symbol_to_token["NIFTY"] = NIFTY_TOKEN
                self._token_to_symbol[NIFTY_TOKEN] = _BENCHMARK_SHORT_SYMBOL

                self._loaded = True
                logger.info(
                    "Alice Blue contract master indexed %d tokens. Watchlist coverage: %d/%d",
                    len(self._token_to_symbol),
                    sum(1 for s in WATCHLIST.keys() if short_symbol(s) in self._symbol_to_token),
                    len(WATCHLIST),
                )
                return True
            except Exception as e:
                logger.error("Error parsing Alice Blue contract master: %s", e)
                return False

    def get_token(self, sym: str) -> Optional[int]:
        s = short_symbol(sym).upper()
        return self._symbol_to_token.get(s)

    def get_symbol(self, token: int) -> Optional[str]:
        return self._token_to_symbol.get(token)


class AliceBlueDataEngine:
    """Sub-50ms WebSocket streaming data engine for Alice Blue."""

    def __init__(self):
        self.contract_master = AliceBlueContractMaster()
        self.user_id = getattr(config, "ALICEBLUE_USER_ID", "2628887").strip()
        self.user_session: Optional[str] = None
        self._running = False
        self._connected = False
        self._handshake_done = False
        self._ws: Optional[websocket.WebSocketApp] = None
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.RLock()
        self._subscribed_tokens: Set[int] = set()

        self.tick_count = 0
        self.last_tick_time = 0.0

    @property
    def running(self) -> bool:
        return self._running

    def _compute_susertoken(self) -> str:
        """Computes double SHA-256 hash of the session token required by NorenWS."""
        h1 = hashlib.sha256(self.user_session.encode("utf-8")).hexdigest()
        return hashlib.sha256(h1.encode("utf-8")).hexdigest()

    def _create_ws_session(self) -> bool:
        """Hits Alice Blue REST API to initialize the WebSocket session."""
        try:
            headers = {
                "Authorization": f"Bearer {self.user_session}",
                "Content-Type": "application/json",
            }
            payload = {"source": "API", "userId": self.user_id}
            resp = requests.post(CREATE_WS_SESS_URL, headers=headers, json=payload, timeout=10)
            if resp.status_code == 200:
                logger.info("Alice Blue createWsSess initialized successfully.")
                return True
            else:
                logger.warning("createWsSess returned HTTP %d: %s", resp.status_code, resp.text)
                return False
        except Exception as e:
            logger.warning("Exception initializing createWsSess: %s", e)
            return False

    def start_websocket(self):
        with self._lock:
            if self._running:
                return

            # 1. Restore or acquire session
            self.user_session = aliceblue_auth.get_cached_session()
            if not self.user_session:
                logger.warning(
                    "Alice Blue: No valid cached session token found. Run `python manual_auth_aliceblue.py` or authorize."
                )
                return

            # 2. Ensure contract master is loaded
            if not self.contract_master.load_contracts():
                logger.error("Alice Blue: Failed to load contract master. Aborting WS start.")
                return

            self._running = True

        logger.info("Starting Alice Blue DataEngine WebSocket...")
        self._create_ws_session()

        self._thread = threading.Thread(
            target=self._run_loop, name="AliceBlueWS-Thread", daemon=True
        )
        self._thread.start()

    def stop_websocket(self):
        with self._lock:
            self._running = False
            self._connected = False
            self._handshake_done = False
            if self._ws:
                try:
                    self._ws.close()
                except Exception:
                    pass
        logger.info("Alice Blue DataEngine stopped.")

    def _subscribe_watchlist(self):
        """Subscribes all 210 stocks + NIFTY 50 on the active socket."""
        tokens_to_sub = []
        for full_sym in ALL_SYMBOLS:
            tok = self.contract_master.get_token(full_sym)
            if tok:
                tokens_to_sub.append(tok)

        if not tokens_to_sub:
            logger.warning("No tokens resolved for subscription!")
            return

        keys = [f"NSE|{t}" for t in tokens_to_sub]
        logger.info("Subscribing %d symbols on Alice Blue WebSocket in batches...", len(keys))

        chunk_size = 50
        for i in range(0, len(keys), chunk_size):
            chunk = keys[i : i + chunk_size]
            sub_msg = {"k": "#".join(chunk), "t": "t"}
            try:
                if self._ws:
                    self._ws.send(json.dumps(sub_msg))
                    time.sleep(0.05)
            except Exception as e:
                logger.error("Failed sending subscription chunk: %s", e)

        with self._lock:
            self._subscribed_tokens.update(tokens_to_sub)

    def _handle_tick(self, data: dict):
        self.tick_count += 1
        self.last_tick_time = time.time()

        tok_val = data.get("tk")
        if tok_val is None:
            return

        try:
            token = int(tok_val)
        except (ValueError, TypeError):
            return

        sym = self.contract_master.get_symbol(token)
        if not sym:
            return

        # Price parsing
        def _f(key: str, default: float = 0.0) -> float:
            val = data.get(key)
            if val is None:
                return default
            try:
                return float(val)
            except (ValueError, TypeError):
                return default

        ltp = _f("lp")
        if ltp <= 0:
            return

        high = _f("h")
        low = _f("l")
        prev_close = _f("c")
        volume = int(_f("v"))
        upper_ckt = _f("uc")
        lower_ckt = _f("lc")
        tot_buy_qty = int(_f("tbq"))
        tot_sell_qty = int(_f("tsq"))

        if token == NIFTY_TOKEN or sym == _BENCHMARK_SHORT_SYMBOL:
            market_state.set_nifty(ltp=ltp, prev_close=prev_close or None)
            candle_aggregator.on_index_tick(_BENCHMARK_SHORT_SYMBOL, ltp, datetime.now(IST))
            return

        process_incoming_tick(
            market_state,
            sym,
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

    def _run_loop(self):
        while self._running:
            # Re-read cached session on each connection attempt in case it was freshly renewed
            latest_session = aliceblue_auth.get_cached_session()
            if latest_session:
                self.user_session = latest_session
            if not self.user_session:
                time.sleep(2)
                continue

            self._create_ws_session()
            susertoken = self._compute_susertoken()

            def on_open(ws):
                logger.info("Alice Blue WebSocket connected. Sending handshake...")
                with self._lock:
                    self._connected = True
                init_msg = {
                    "susertoken": susertoken,
                    "t": "c",
                    "actid": f"{self.user_id}_API",
                    "uid": f"{self.user_id}_API",
                    "source": "API",
                }
                ws.send(json.dumps(init_msg))

            def on_message(ws, raw_msg):
                try:
                    data = (
                        json.loads(raw_msg)
                        if isinstance(raw_msg, str) and raw_msg.startswith("{")
                        else raw_msg
                    )
                except Exception:
                    return

                if not isinstance(data, dict):
                    return

                # Handshake acknowledgement
                if data.get("t") == "ck" and data.get("s") == "OK":
                    logger.info("Alice Blue WebSocket handshake SUCCESSFUL!")
                    with self._lock:
                        self._handshake_done = True
                    self._subscribe_watchlist()
                    return

                # Real-time tick message
                if data.get("t") in ("tk", "tf"):
                    self._handle_tick(data)

            def on_error(ws, error):
                logger.warning("Alice Blue WebSocket error: %s", error)

            def on_close(ws, status_code, close_msg):
                logger.info("Alice Blue WebSocket closed: %s (%s)", status_code, close_msg)
                with self._lock:
                    self._connected = False
                    self._handshake_done = False

            try:
                self._ws = websocket.WebSocketApp(
                    WS_URL,
                    on_open=on_open,
                    on_message=on_message,
                    on_error=on_error,
                    on_close=on_close,
                )
                self._ws.run_forever(ping_interval=20, ping_timeout=10)
            except Exception as e:
                logger.error("Alice Blue WS loop exception: %s", e)

            if self._running:
                logger.info("Alice Blue WS reconnecting in 5 seconds...")
                time.sleep(5)


# Global singleton
aliceblue_engine = AliceBlueDataEngine()
