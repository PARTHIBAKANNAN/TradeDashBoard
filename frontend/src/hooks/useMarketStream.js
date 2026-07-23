import { useEffect, useRef, useState } from "react";

const CACHE_KEY = "dashboard_offline_cache";
const EMPTY = { market_open: false, nifty: {}, stocks: [] };
const CANDLE_INTERVAL_MIN = 5;

// Minutes-since-midnight, floored to the current 5-min bucket — a plain
// comparable int, not a display string.
function candleBucket(d) {
  return d.getHours() * 60 + Math.floor(d.getMinutes() / CANDLE_INTERVAL_MIN) * CANDLE_INTERVAL_MIN;
}

function dayStamp(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Subscribes to the BFF's 1-second SSE stream. Mirrors each payload into
 * localStorage so that on disconnect (or an off-market reload) we can render
 * the last known snapshot with a "Closed / Offline" indicator instead of a
 * blank screen.
 *
 * Also builds a live 5-min candlestick history per stock purely from the LTP
 * already carried on every tick — no extra backend field or bandwidth, and
 * (unlike the backend's REST-backfilled prev-day range) it never depends on
 * FYERS' historical-data permission at all. Resets once per new trading day;
 * only reflects ticks received since this tab was opened.
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
  const candlesRef = useRef(new Map()); // symbol -> candle[] for the current trading day
  const candleDayRef = useRef(dayStamp(new Date()));

  useEffect(() => {
    const es = new EventSource("/api/stream");
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const now = new Date();

        const today = dayStamp(now);
        if (today !== candleDayRef.current) {
          candlesRef.current = new Map();
          candleDayRef.current = today;
        }

        const bucket = candleBucket(now);
        for (const stock of payload.stocks || []) {
          if (!stock.ltp) continue;
          const prevSeries = candlesRef.current.get(stock.symbol) || [];
          const prevLast = prevSeries[prevSeries.length - 1];
          let series;
          if (prevLast && prevLast.bucket === bucket) {
            // New object (not a mutation) so reference-equality-based effect
            // deps (MiniCandlestick's useEffect) actually detect the change.
            const updatedLast = {
              ...prevLast,
              high: Math.max(prevLast.high, stock.ltp),
              low: Math.min(prevLast.low, stock.ltp),
              close: stock.ltp,
            };
            series = [...prevSeries.slice(0, -1), updatedLast];
          } else {
            series = [...prevSeries, { bucket, open: stock.ltp, high: stock.ltp, low: stock.ltp, close: stock.ltp }];
          }
          candlesRef.current.set(stock.symbol, series);
          stock.candles = series;
        }

        setData(payload);
        setConnected(true);
        if (payload.stocks?.length) {
          // Candle history can grow to ~75 candles/stock by close — strip it
          // from the offline cache so localStorage writes stay small and fast;
          // the live in-memory `data` (used for rendering) keeps it.
          const cacheable = {
            ...payload,
            stocks: payload.stocks.map(({ candles, ...rest }) => rest),
          };
          localStorage.setItem(CACHE_KEY, JSON.stringify(cacheable));
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
