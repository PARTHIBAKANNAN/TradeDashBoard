import { useEffect, useSyncExternalStore } from "react";
import { marketStore } from "../store/marketStore.js";
import { candleBucket, mergeTick } from "../utils/candleMerge.js";

const CACHE_KEY = "dashboard_offline_cache";
const CANDLE_CACHE_KEY = "dashboard_candle_cache";
const CANDLE_PERSIST_INTERVAL_MS = 15_000;

function dayStamp(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ---- Module-level singleton WebSocket controller ----
// Kept outside React so remounts don't tear the socket down.
let ws = null;
let refCount = 0;
let backoffMs = 500;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastFrameAt = 0;

let candlesMap = new Map(); // symbol -> candle[]
let candleDay = dayStamp(new Date());
let lastCandlePersistAt = 0;

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = backoffMs;
  backoffMs = Math.min(backoffMs * 2, 10_000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function armHeartbeat() {
  clearInterval(heartbeatTimer);
  lastFrameAt = Date.now();
  heartbeatTimer = setInterval(() => {
    if (Date.now() - lastFrameAt > 30_000 && ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }, 5_000);
}

function warmFromCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const frame = JSON.parse(cached);
      if (frame && frame.type === "snapshot") marketStore.applyFrame(frame);
    }
  } catch {
    /* ignore */
  }
  restoreCandles();
}

function persistSnapshot(frame) {
  try {
    if (frame?.type === "snapshot") {
      localStorage.setItem(CACHE_KEY, JSON.stringify(frame));
    }
  } catch {
    /* ignore */
  }
}

// Candle history is rebuilt purely from live ticks (see processCandles), so a
// plain page reload used to throw away everything accumulated so far today —
// annoying if you refresh mid-session. Persist/restore it separately from the
// main offline-cache snapshot (which intentionally excludes candles to keep
// that write small/fast every tick — see persistSnapshot). Restoring is only
// valid for the *same* trading day; a stale cache from a previous day is
// discarded so the chart still correctly starts empty each morning.
function restoreCandles() {
  try {
    const raw = localStorage.getItem(CANDLE_CACHE_KEY);
    if (!raw) return;
    const { day, candles } = JSON.parse(raw);
    if (day !== dayStamp(new Date())) return;
    candleDay = day;
    candlesMap = new Map(Object.entries(candles || {}));
  } catch {
    /* ignore */
  }
}

function persistCandles(force = false) {
  const now = Date.now();
  if (!force && now - lastCandlePersistAt < CANDLE_PERSIST_INTERVAL_MS) return;
  lastCandlePersistAt = now;
  try {
    localStorage.setItem(
      CANDLE_CACHE_KEY,
      JSON.stringify({
        day: candleDay,
        candles: Object.fromEntries(candlesMap),
      }),
    );
  } catch {
    /* ignore — e.g. storage quota; candles just won't survive a reload this time */
  }
}

function wsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/stream`;
}

function processCandles(stocks) {
  if (!stocks || !stocks.length) return;
  const now = new Date();
  const today = dayStamp(now);
  if (today !== candleDay) {
    candlesMap = new Map();
    candleDay = today;
  }
  const bucket = candleBucket(now);
  for (const stock of stocks) {
    if (!stock.ltp) continue;
    const prevSeries = candlesMap.get(stock.symbol) || [];
    const series = mergeTick(prevSeries, stock.ltp, bucket);
    candlesMap.set(stock.symbol, series);
    stock.candles = series;
  }
}

let hasSeededCandles = false;

async function seedAllMiniCandles() {
  if (hasSeededCandles) return;
  try {
    const res = await fetch("/api/charts/all-mini-candles", { credentials: "include" });
    if (res.ok) {
      const all = await res.json();
      hasSeededCandles = true;
      for (const [sym, list] of Object.entries(all)) {
        if (Array.isArray(list) && list.length > 0) {
          candlesMap.set(sym, list);
        }
      }
      persistCandles(true);
      const curStocks = marketStore.getSnapshot().stocks;
      if (curStocks && curStocks.length) {
        for (const s of curStocks) {
          if (candlesMap.has(s.symbol)) {
            s.candles = candlesMap.get(s.symbol);
          }
        }
        marketStore.applyFrame({ type: "delta", stocks: curStocks, seq: marketStore.getMeta().lastSeq });
      }
    }
  } catch {
    /* ignore */
  }
}

function connect() {
  if (ws) return;
  seedAllMiniCandles();
  const socket = new WebSocket(wsUrl());
  ws = socket;

  socket.onopen = () => {
    backoffMs = 500;
    marketStore.setConnected(true);
    armHeartbeat();
    seedAllMiniCandles();
  };

  socket.onmessage = (ev) => {
    lastFrameAt = Date.now();
    try {
      const frame = JSON.parse(ev.data);
      // Detect sequence gap on delta frames -> ask server for a fresh snapshot.
      if (frame?.type === "delta") {
        const lastSeq = marketStore.getMeta().lastSeq;
        if (lastSeq > 0 && frame.seq !== lastSeq + 1) {
          try {
            socket.send(JSON.stringify({ type: "resync" }));
          } catch {
            /* ignore */
          }
        }
      }
      processCandles(frame.stocks);
      marketStore.applyFrame(frame);
      persistSnapshot(frame);
      persistCandles();
    } catch (err) {
      console.error("WS decode error:", err);
    }
  };

  socket.onerror = () => {
    // onclose will follow; nothing to do here.
  };

  socket.onclose = () => {
    ws = null;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    marketStore.setConnected(false);
    if (refCount > 0) scheduleReconnect();
  };
}

function acquire() {
  if (refCount === 0) warmFromCache();
  refCount += 1;
  connect();
}

function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0) {
    persistCandles(true); // flush immediately rather than waiting for the throttle
    backoffMs = 500;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      ws = null;
    }
  }
}

// ---- React hooks ----
/**
 * Starts the singleton WebSocket on mount and tears it down on unmount.
 * Consumers read live state via useStock / useSymbols / useMarketMeta.
 */
export function useMarketStream() {
  useEffect(() => {
    acquire();
    return () => release();
  }, []);
}

export function useStock(symbol) {
  return useSyncExternalStore(
    (cb) => marketStore.subscribeStock(symbol, cb),
    () => marketStore.getStock(symbol),
    () => marketStore.getStock(symbol),
  );
}

export function useSymbols() {
  return useSyncExternalStore(
    (cb) => marketStore.subscribeSymbols(cb),
    () => marketStore.getSymbols(),
    () => marketStore.getSymbols(),
  );
}

export function useMarketMeta() {
  return useSyncExternalStore(
    (cb) => marketStore.subscribeMeta(cb),
    () => marketStore.getMeta(),
    () => marketStore.getMeta(),
  );
}
