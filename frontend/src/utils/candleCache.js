// Plain in-memory cache for the Charts tab's per-symbol candle fetches.
// Once a stock's chart has been viewed, scrolling back to it (re-entering the
// virtualized feed's viewport) is instant — no re-fetch — rather than hitting
// the backend every time a chart re-mounts. Intentionally simple (no LRU/TTL
// eviction): 210 symbols x ~75 rows/day is a small amount of data to hold for
// a single tab's lifetime, and it's cleared on page reload like every other
// in-memory store in this app.
const cache = new Map(); // symbol -> { candles, levels, date, fetchedAt }

export function getCached(symbol) {
  return cache.get(symbol) || null;
}

export function setCached(symbol, entry) {
  cache.set(symbol, { ...entry, fetchedAt: Date.now() });
}

// Invalidate a symbol's cached fetch — used when the calendar day rolls over
// mid-session (rare, but the cached "today" would otherwise be yesterday's).
export function invalidate(symbol) {
  cache.delete(symbol);
}

export function clearAll() {
  cache.clear();
}
