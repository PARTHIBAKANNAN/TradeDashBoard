import { useSyncExternalStore } from "react";

// Wishlist for the Charts tab's "+" icon — deliberately a SEPARATE list from
// the existing Watchlist tab's "watchlist" localStorage key/star mechanism,
// per explicit instruction (the two are independent lists, not aliases of
// each other). Same useSyncExternalStore pattern as marketStore.js.
const STORAGE_KEY = "chartsWishlist";

function readStored() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function createChartsWishlistStore() {
  let set = readStored();
  const subs = new Set();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    } catch {
      /* ignore — e.g. storage quota */
    }
  }
  function notify() {
    subs.forEach((cb) => cb());
  }

  return {
    has(symbol) {
      return set.has(symbol);
    },
    getAll() {
      return set;
    },
    toggle(symbol) {
      if (set.has(symbol)) {
        set = new Set(set);
        set.delete(symbol);
      } else {
        set = new Set(set);
        set.add(symbol);
      }
      persist();
      notify();
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

export const chartsWishlistStore = createChartsWishlistStore();

export function useChartsWishlist() {
  return useSyncExternalStore(
    chartsWishlistStore.subscribe,
    chartsWishlistStore.getAll,
    chartsWishlistStore.getAll,
  );
}
