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

export async function fetchHistory(limit = 50, offset = 0) {
  const j = await api(`/api/paper/orders/history?limit=${limit}&offset=${offset}`);
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
