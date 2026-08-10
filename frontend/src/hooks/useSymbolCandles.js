import { useEffect, useRef, useState } from "react";
import { useStock } from "./useMarketStream.js";
import { candleBucket, mergeTick } from "../utils/candleMerge.js";
import { getCached, setCached } from "../utils/candleCache.js";

// Client-side mirror of candle_aggregator.py's _tick_delta() — same tick
// rule applied to broadcast fields. Kept local to this hook.
function mergeTickWithDelta(series, ltp, bucket, tickDelta) {
  const merged = mergeTick(series, ltp, bucket);
  const last = merged[merged.length - 1];
  merged[merged.length - 1] = { ...last, delta: (last.delta || 0) + tickDelta };
  return merged;
}

/**
 * Per-symbol candle + reference-level data for a single day.
 *
 * @param {string} symbol
 * @param {string|"today"} viewDate — "today" (default) or "YYYY-MM-DD" for
 *   historical navigation. When "today", live ticks are merged; for historical
 *   dates, the candles are frozen (no live merging).
 */
export function useSymbolCandles(symbol, viewDate = "today") {
  const [candles, setCandles] = useState([]);
  const [levels, setLevels] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPreviousDay, setIsPreviousDay] = useState(false);
  const [candleDate, setCandleDate] = useState(null);
  const stock = useStock(symbol);
  const lastLtpRef = useRef(null);
  const lastVolumeRef = useRef(null);
  // Track whether live merging should happen (only for today's view).
  const isLiveRef = useRef(viewDate === "today");

  useEffect(() => {
    isLiveRef.current = viewDate === "today";
    lastLtpRef.current = null;
    lastVolumeRef.current = null;

    const cacheKey = `${symbol}__${viewDate}`;
    const cached = getCached(cacheKey);
    if (cached) {
      setCandles(cached.candles);
      setLevels(cached.levels);
      setIsPreviousDay(cached.isPreviousDay ?? false);
      setCandleDate(cached.candleDate ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const url =
      viewDate === "today"
        ? `/api/charts/candles/${encodeURIComponent(symbol)}`
        : `/api/charts/candles/${encodeURIComponent(symbol)}/day?date=${viewDate}`;

    fetch(url, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const normalized = (data.candles || []).map((c) => ({
          bucket_date: c.bucket_date || null,
          bucket: c.bucket_minute,
          bucket_minute: c.bucket_minute,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          delta: c.delta || 0,
        }));
        const prevDay = data.is_previous_day ?? false;
        const cDate = data.candle_date ?? null;
        setCandles(normalized);
        setLevels(data.levels || null);
        setIsPreviousDay(prevDay);
        setCandleDate(cDate);
        setCached(cacheKey, {
          candles: normalized,
          levels: data.levels || null,
          isPreviousDay: prevDay,
          candleDate: cDate,
        });
      })
      .catch(() => {
        if (!cancelled) setCandles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [symbol, viewDate]);

  // Live tick merging — only active when viewing today's data.
  useEffect(() => {
    if (!isLiveRef.current) return;
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
      if (!prev.length) return prev;
      const next = mergeTickWithDelta(prev, ltp, candleBucket(new Date()), tickDelta);
      const cacheKey = `${symbol}__today`;
      setCached(cacheKey, { candles: next, levels, isPreviousDay: false, candleDate });
      return next;
    });
  }, [stock?.ltp, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  return { candles, levels, loading, isPreviousDay, candleDate };
}

/**
 * Multi-day candles for the full-screen modal. Fetches up to `days` trading
 * days of 5-min data in one request. Also merges live ticks for today's last bar.
 */
export function useMultiDayCandles(symbol, days = 21) {
  const [candles, setCandles] = useState([]);
  const [levels, setLevels] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPreviousDay, setIsPreviousDay] = useState(false);
  const [candleDate, setCandleDate] = useState(null);
  const stock = useStock(symbol);
  const lastLtpRef = useRef(null);
  const lastVolumeRef = useRef(null);

  useEffect(() => {
    lastLtpRef.current = null;
    lastVolumeRef.current = null;
    let cancelled = false;
    setLoading(true);

    fetch(`/api/charts/candles/${encodeURIComponent(symbol)}/history?days=${days}`, {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const normalized = (data.candles || []).map((c) => ({
          bucket_date: c.bucket_date || null,
          bucket: c.bucket_minute,
          bucket_minute: c.bucket_minute,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          delta: c.delta || 0,
        }));
        setCandles(normalized);
        setLevels(data.levels || null);
        setIsPreviousDay(data.is_previous_day ?? false);
        setCandleDate(data.candle_date ?? null);
      })
      .catch(() => {
        if (!cancelled) setCandles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [symbol, days]);

  // Live tick merging on the last bar (only when today's data is present).
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
      if (!prev.length) return prev;
      return mergeTickWithDelta(prev, ltp, candleBucket(new Date()), tickDelta);
    });
  }, [stock?.ltp, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  return { candles, levels, loading, isPreviousDay, candleDate };
}
