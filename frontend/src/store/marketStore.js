// Per-symbol reactive store backed by a Map. Fine-grained subscriptions
// let a WatchlistRow re-render only when its own stock changes.

function createStore() {
  let stocks = new Map();                 // symbol -> stock object
  let symbols = [];                        // stable-sorted symbol list
  let meta = {
    marketOpen: false,
    fyersConnected: false,
    connected: false,
    nifty: {},
    lastSeq: 0,
  };

  const stockSubs = new Map();             // symbol -> Set<cb>
  const symbolSubs = new Set();            // Set<cb>
  const metaSubs = new Set();              // Set<cb>

  function notifyStock(sym) {
    const subs = stockSubs.get(sym);
    if (subs) subs.forEach((cb) => cb());
  }
  function notifySymbols() { symbolSubs.forEach((cb) => cb()); }
  function notifyMeta() { metaSubs.forEach((cb) => cb()); }

  function recomputeSymbolList() {
    const next = Array.from(stocks.keys()).sort();
    if (next.length !== symbols.length ||
        next.some((s, i) => s !== symbols[i])) {
      symbols = next;
      notifySymbols();
    }
  }

  function applySnapshot(frame) {
    stocks = new Map();
    for (const s of frame.stocks || []) stocks.set(s.symbol, { ...s });
    meta = {
      ...meta,
      marketOpen: !!frame.market_open,
      fyersConnected: !!frame.fyers_connected,
      nifty: { ...(frame.nifty || {}) },
      lastSeq: frame.seq ?? meta.lastSeq,
    };
    recomputeSymbolList();
    // After a snapshot every row should re-render.
    stockSubs.forEach((_subs, sym) => notifyStock(sym));
    notifyMeta();
  }

  function applyDelta(frame) {
    let metaChanged = false;
    if ("market_open" in frame) {
      meta = { ...meta, marketOpen: !!frame.market_open };
      metaChanged = true;
    }
    if ("fyers_connected" in frame) {
      meta = { ...meta, fyersConnected: !!frame.fyers_connected };
      metaChanged = true;
    }
    if (frame.nifty) {
      meta = { ...meta, nifty: { ...meta.nifty, ...frame.nifty } };
      metaChanged = true;
    }
    if (frame.seq != null && frame.seq !== meta.lastSeq) {
      meta = { ...meta, lastSeq: frame.seq };
      metaChanged = true;
    }

    let membershipChanged = false;
    for (const entry of frame.stocks || []) {
      const sym = entry.symbol;
      const existing = stocks.get(sym);
      if (existing) {
        stocks.set(sym, { ...existing, ...entry });
        notifyStock(sym);
      } else {
        stocks.set(sym, { ...entry });
        membershipChanged = true;
        notifyStock(sym);
      }
    }
    if (membershipChanged) recomputeSymbolList();
    if (metaChanged) notifyMeta();
  }

  return {
    applyFrame(frame) {
      if (!frame || !frame.type) return;
      if (frame.type === "snapshot") applySnapshot(frame);
      else if (frame.type === "delta") applyDelta(frame);
    },
    getStock(sym) { return stocks.get(sym); },
    getSymbols() { return symbols; },
    getMeta() { return meta; },

    subscribeStock(sym, cb) {
      let subs = stockSubs.get(sym);
      if (!subs) { subs = new Set(); stockSubs.set(sym, subs); }
      subs.add(cb);
      return () => {
        subs.delete(cb);
        if (subs.size === 0) stockSubs.delete(sym);
      };
    },
    subscribeSymbols(cb) {
      symbolSubs.add(cb);
      return () => symbolSubs.delete(cb);
    },
    subscribeMeta(cb) {
      metaSubs.add(cb);
      return () => metaSubs.delete(cb);
    },

    setConnected(flag) {
      if (meta.connected === flag) return;
      meta = { ...meta, connected: flag };
      notifyMeta();
    },

    reset() {
      stocks = new Map();
      symbols = [];
      meta = { marketOpen: false, fyersConnected: false, connected: false,
               nifty: {}, lastSeq: 0 };
      stockSubs.clear();
      symbolSubs.clear();
      metaSubs.clear();
    },
  };
}

export const marketStore = createStore();
