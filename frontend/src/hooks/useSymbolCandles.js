import { useEffect, useState } from "react";
import { useStock } from "./useMarketStream.js";
import { candleBucket, mergeTick } from "../utils/candleMerge.js";
import { getCached, setCached } from "../utils/candleCache.js";

// Per-symbol candle + reference-level data for the Charts tab. Only ever
// instantiated while a chart is actually mounted (in/near the viewport) --
// see ChartRow's lazy-mount via useInViewport. Fetches "today so far" once
// per symbol (cached across re-mounts from scrolling back), then keeps the
// last bar live via the same per-symbol tick stream every other screen uses.
export function useSymbolCandles(symbol) {
  const [candles, setCandles] = useState([]);
  const [levels, setLevels] = useState(null);
  const [loading, setLoading] = useState(true);
  const stock = useStock(symbol);

  useEffect(() => {
    const cached = getCached(symbol);
    if (cached) {
      setCandles(cached.candles);
      setLevels(cached.levels);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/charts/candles/${encodeURIComponent(symbol)}`, {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const normalized = (data.candles || []).map((c) => ({
          bucket: c.bucket_minute,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        setCandles(normalized);
        setLevels(data.levels || null);
        setCached(symbol, { candles: normalized, levels: data.levels || null });
      })
      .catch(() => {
        if (!cancelled) setCandles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    if (!stock?.ltp) return;
    setCandles((prev) => {
      if (!prev.length) return prev; // don't synthesize a series before the initial fetch resolves
      const next = mergeTick(prev, stock.ltp, candleBucket(new Date()));
      setCached(symbol, { candles: next, levels });
      return next;
    });
    // `levels` intentionally excluded — it only changes on refetch (symbol
    // change), so reading it via closure here can't meaningfully go stale.
  }, [stock?.ltp, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  return { candles, levels, loading };
}
