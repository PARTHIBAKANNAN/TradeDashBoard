import { useEffect, useSyncExternalStore } from "react";
import { ordersStore } from "../store/ordersStore.js";

const POLL_INTERVAL_MS = 5_000; // catches server-side SL/Target/limit fills, not just our own actions

async function api(path, opts) {
  const r = await fetch(path, { credentials: "include", ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${r.status})`);
  }
  return r.json();
}

export async function fetchPositions() {
  const j = await api("/api/paper/positions");
  ordersStore.setPositions(j.positions || []);
  return j.positions;
}

// Remembers the last explicitly-requested range/limit so that plain
// `fetchHistory()` calls (the periodic poll in usePaperTradingSync, and the
// post-cancel/post-close refreshes below) keep respecting whatever date
// range the user has selected in the UI, instead of silently resetting the
// view back to "recent 50" underneath them.
let _lastHistoryParams = { limit: 50, offset: 0, from: undefined, to: undefined };

// `from`/`to` are Date objects (see utils/dateRanges.js). Pass a generous
// `limit` once a date range is active, since the same fetched rows back both
// the on-screen table and every export button (no separate export-only request).
export async function fetchHistory(overrides = {}) {
  _lastHistoryParams = { ..._lastHistoryParams, ...overrides };
  const { limit, offset, from, to } = _lastHistoryParams;
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (from) params.set("from_ts", from.toISOString());
  if (to) params.set("to_ts", to.toISOString());
  const j = await api(`/api/paper/orders/history?${params.toString()}`);
  ordersStore.setHistory(j.orders || []);
  return j.orders;
}

export async function fetchSummary() {
  const j = await api("/api/paper/pnl/summary");
  ordersStore.setSummary(j);
  return j;
}

export function fetchMargin(symbol) {
  return api(`/api/paper/margin?symbol=${encodeURIComponent(symbol)}`);
}

export async function placeOrder(body) {
  const order = await api("/api/paper/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await Promise.all([fetchPositions(), fetchSummary()]);
  return order;
}

export async function modifyPosition(id, body) {
  const order = await api(`/api/paper/orders/${id}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await fetchPositions();
  return order;
}

export async function cancelOrder(id) {
  const order = await api(`/api/paper/orders/${id}/cancel`, { method: "POST" });
  await Promise.all([fetchPositions(), fetchHistory()]);
  return order;
}

export async function closeOrder(id) {
  const order = await api(`/api/paper/orders/${id}/close`, { method: "POST" });
  await Promise.all([fetchPositions(), fetchHistory(), fetchSummary()]);
  return order;
}

export async function depositToWallet(amount) {
  const result = await api("/api/paper/wallet/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  await fetchSummary();
  return result;
}

export async function resetWallet() {
  const result = await api("/api/paper/wallet/reset", { method: "POST" });
  await fetchSummary();
  return result;
}

// ---- React hooks ----
export function usePositions() {
  return useSyncExternalStore(
    (cb) => ordersStore.subscribe(cb),
    () => ordersStore.getPositions(),
    () => ordersStore.getPositions(),
  );
}

export function useOrderHistory() {
  return useSyncExternalStore(
    (cb) => ordersStore.subscribe(cb),
    () => ordersStore.getHistory(),
    () => ordersStore.getHistory(),
  );
}

export function usePnlSummary() {
  return useSyncExternalStore(
    (cb) => ordersStore.subscribe(cb),
    () => ordersStore.getSummary(),
    () => ordersStore.getSummary(),
  );
}

// Loads once on mount, then polls — server-side bracket/limit fills happen
// without any client action, so the positions/history/summary views need to
// re-sync on a timer rather than only after a user-initiated mutation.
export function usePaperTradingSync() {
  useEffect(() => {
    const refresh = () => {
      fetchPositions().catch(() => {});
      fetchHistory().catch(() => {});
      fetchSummary().catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}

const POSITIONS_COUNT_POLL_MS = 20_000;

// Lightweight and independent of usePaperTradingSync — lets the main nav tab
// show a live open-position count even if the user has never opened the
// Paper Trading screen. Deliberately a longer interval since it only backs
// a badge, not the actionable positions view.
export function usePositionsCount() {
  useEffect(() => {
    const refresh = () => fetchPositions().catch(() => {});
    refresh();
    const id = setInterval(refresh, POSITIONS_COUNT_POLL_MS);
    return () => clearInterval(id);
  }, []);
  const positions = usePositions();
  return positions.filter((p) => p.status === "OPEN").length;
}
