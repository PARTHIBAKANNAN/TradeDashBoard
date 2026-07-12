import { useEffect, useRef, useState } from "react";

const CACHE_KEY = "dashboard_offline_cache";
const EMPTY = { market_open: false, nifty: {}, stocks: [] };

/**
 * Subscribes to the BFF's 1-second SSE stream. Mirrors each payload into
 * localStorage so that on disconnect (or an off-market reload) we can render
 * the last known snapshot with a "Closed / Offline" indicator instead of a
 * blank screen.
 */
export function useMarketStream() {
  const [data, setData] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : EMPTY;
    } catch {
      return EMPTY;
    }
  });
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setData(payload);
        setConnected(true);
        if (payload.stocks?.length) {
          localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        }
      } catch (err) {
        console.error("SSE decode error:", err);
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; reflect the drop in the UI meanwhile.
      setConnected(false);
    };

    return () => es.close();
  }, []);

  return { data, connected };
}
