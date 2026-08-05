// Shared 5-min candle bucketing/merge logic — used both by useMarketStream.js's
// live client-side candle building (mini-candlestick charts) and by
// useSymbolCandles.js (the Charts tab), so there's exactly one implementation
// of "fold a tick into a candle series" instead of two copies drifting apart.
//
// Deliberately assumes the browser's own clock already reads IST (no explicit
// Asia/Kolkata conversion) — matching every other candle-bucketing computation
// already shipping in this app (dayStamp/candleBucket in useMarketStream.js
// predate this file and make the same assumption); introducing a "more
// correct" conversion here would just disagree with code already in production.
export const CANDLE_INTERVAL_MIN = 5;

// Minutes-since-midnight, floored to the current 5-min bucket.
export function candleBucket(d) {
  return (
    d.getHours() * 60 +
    Math.floor(d.getMinutes() / CANDLE_INTERVAL_MIN) * CANDLE_INTERVAL_MIN
  );
}

// Folds one tick (ltp at the given bucket) into an existing oldest-first
// candle series, returning a new array (never mutates `series`). Extends the
// running last candle's high/low/close if the tick falls in the same bucket,
// otherwise opens a fresh candle.
export function mergeTick(series, ltp, bucket) {
  const prevLast = series[series.length - 1];
  if (prevLast && prevLast.bucket === bucket) {
    const updatedLast = {
      ...prevLast,
      high: Math.max(prevLast.high, ltp),
      low: Math.min(prevLast.low, ltp),
      close: ltp,
    };
    return [...series.slice(0, -1), updatedLast];
  }
  return [...series, { bucket, open: ltp, high: ltp, low: ltp, close: ltp }];
}
