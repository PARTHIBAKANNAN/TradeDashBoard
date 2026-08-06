import { useEffect, useRef, useState } from "react";
import { useStock } from "./useMarketStream.js";
import { candleBucket, mergeTick } from "../utils/candleMerge.js";
import { getCached, setCached } from "../utils/candleCache.js";

// Client-side mirror of candle_aggregator.py's _tick_delta() -- same tick
// rule (uptick since the last seen tick -> buy-classified, downtick ->
// sell-classified), applied to the same broadcast fields (ltp + cumulative
// day volume) every other screen already receives. Kept local to this hook
// rather than folded into the shared candleMerge.js, since nothing else on
// the frontend needs delta -- an isolated addition, same rationale as the
// backend's own separate _last_ltp/_last_volume tracking.
function mergeTickWithDelta(series, ltp, bucket, tickDelta) {
  const merged = mergeTick(series, ltp, bucket);
  const last = merged[merged.length - 1];
  merged[merged.length - 1] = { ...last, delta: (last.delta || 0) + tickDelta };
  return merged;
}

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
  const lastLtpRef = useRef(null);
  const lastVolumeRef = useRef(null);

  useEffect(() => {
    lastLtpRef.current = null;
    lastVolumeRef.current = null;
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
          delta: c.delta || 0,
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
    const ltp = stock.ltp;
    const volume = stock.volume || 0;
    const prevLtp = lastLtpRef.current;
    const prevVolume = lastVolumeRef.current ?? volume;
    const volDelta = Math.max(0, volume - prevVolume);
    let tickDelta = 0;
    if (prevLtp != null && volDelta > 0) {
      if (ltp > prevLtp) tickDelta = volDelta;
      else if (ltp < prevLtp) tickDelta = -volDelta;
    }
    lastLtpRef.current = ltp;
    lastVolumeRef.current = volume;

    setCandles((prev) => {
      if (!prev.length) return prev; // don't synthesize a series before the initial fetch resolves
      const next = mergeTickWithDelta(
        prev,
        ltp,
        candleBucket(new Date()),
        tickDelta,
      );
      setCached(symbol, { candles: next, levels });
      return next;
    });
    // `levels` intentionally excluded — it only changes on refetch (symbol
    // change), so reading it via closure here can't meaningfully go stale.
  }, [stock?.ltp, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  return { candles, levels, loading };
}
