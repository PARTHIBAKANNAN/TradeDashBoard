import { useEffect, useSyncExternalStore } from "react";
import { marketStore } from "../store/marketStore.js";

const CACHE_KEY = "dashboard_offline_cache";

// ---- Module-level singleton WebSocket controller ----
// Kept outside React so remounts don't tear the socket down.
let ws = null;
let refCount = 0;
let backoffMs = 500;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastFrameAt = 0;

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
      try { ws.close(); } catch { /* ignore */ }
    }
  }, 5_000);
}

function warmFromCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return;
    const frame = JSON.parse(cached);
    if (frame && frame.type === "snapshot") marketStore.applyFrame(frame);
  } catch { /* ignore */ }
}

function persistSnapshot(frame) {
  try {
    if (frame?.type === "snapshot") {
      localStorage.setItem(CACHE_KEY, JSON.stringify(frame));
    }
  } catch { /* ignore */ }
}

function wsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/stream`;
}

function connect() {
  if (ws) return;
  const socket = new WebSocket(wsUrl());
  ws = socket;

  socket.onopen = () => {
    backoffMs = 500;
    marketStore.setConnected(true);
    armHeartbeat();
  };

  socket.onmessage = (ev) => {
    lastFrameAt = Date.now();
    try {
      const frame = JSON.parse(ev.data);
      // Detect sequence gap on delta frames → ask server for a fresh snapshot.
      if (frame?.type === "delta") {
        const lastSeq = marketStore.getMeta().lastSeq;
        if (lastSeq > 0 && frame.seq !== lastSeq + 1) {
          try { socket.send(JSON.stringify({ type: "resync" })); } catch { /* ignore */ }
          // Still merge what we got; the incoming snapshot will overwrite.
        }
      }
      marketStore.applyFrame(frame);
      persistSnapshot(frame);
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
  refCount += 1;
  warmFromCache();
  connect();
}

function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0) {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    if (ws) {
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }
  }
}

// ---- React hooks ----
export function useMarketStream() {
  useEffect(() => {
    acquire();
    return () => release();
  }, []);
  const meta = useMarketMeta();
  return { connected: meta.connected };
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
