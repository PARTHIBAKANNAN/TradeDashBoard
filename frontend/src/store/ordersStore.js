// Singleton store for paper-trading data (positions, history, wallet/P&L
// summary). Mirrors marketStore.js's hand-rolled pattern, but with a single
// subscriber registry — no per-symbol fan-out needed here, the whole set is
// small and always fetched together.

function createOrdersStore() {
  let positions = [];
  let history = [];
  let summary = null;

  const subs = new Set();
  function notify() {
    subs.forEach((cb) => cb());
  }

  return {
    getPositions() {
      return positions;
    },
    getHistory() {
      return history;
    },
    getSummary() {
      return summary;
    },
    setPositions(next) {
      positions = next;
      notify();
    },
    setHistory(next) {
      history = next;
      notify();
    },
    setSummary(next) {
      summary = next;
      notify();
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

export const ordersStore = createOrdersStore();
