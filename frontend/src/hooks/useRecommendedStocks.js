import { useMemo } from "react";
import { momentumScore, buildSectorMeans } from "../utils/momentumScore.js";

const MARKET_OPEN_MIN = 9 * 60 + 15;
const CONFIDENCE_FLOOR = 60; // tune after seeing real score distributions
const MAX_PICKS = 3;

// 0 for 09:15-09:45, 1 for 09:45-10:15, 2 for 10:15-10:45, 3 for 10:45-11:15,
// then one more every 30 min — lines up with the ORB candle boundaries for
// the first four checkpoints (config.py's ORB_CANDLES), then keeps going.
function currentCheckpointBucket() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return Math.floor((mins - MARKET_OPEN_MIN) / 30);
}

// Picks the top-N highest-confidence stocks by momentumScore, but only
// re-locks the picks when a 30-min checkpoint is crossed — not on every tick
// — so the "Recommended" tag holds steady instead of flickering as the
// underlying score jitters tick-to-tick between checkpoints.
export function useRecommendedStocks(stocks, niftyPctChange) {
  const bucket = currentCheckpointBucket();

  const sectorMeans = useMemo(() => buildSectorMeans(stocks), [stocks]);

  const scored = useMemo(
    () =>
      (stocks || []).map((s) => ({
        symbol: s.symbol,
        score: momentumScore(s, stocks, niftyPctChange, sectorMeans),
      })),
    [stocks, niftyPctChange, sectorMeans],
  );

  // Intentionally keyed ONLY on `bucket`, not `scored` — this freezes the
  // picks between checkpoints by design. See module comment above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () =>
      scored
        .filter((s) => s.score >= CONFIDENCE_FLOOR)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_PICKS)
        .map((s) => s.symbol),
    [bucket],
  );
}
