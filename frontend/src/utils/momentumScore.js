import { INDUSTRY_GROUP } from "./industryGroup.js";

// Maps INDUSTRY_GROUP's fine-grained sectors (not marketStore's stock.sector,
// see industryGroup.js) to NIFTY-style clusters for the RS-vs-sector score
// component. Keep in sync with backend/app/momentum_score.py's SECTOR_TO_NIFTY_GROUP.
const INDUSTRY_TO_NIFTY_GROUP = {
  Energy: "NIFTY ENERGY",
  Power: "NIFTY ENERGY",
  "Capital Goods": "NIFTY CAPITAL GOODS",
  "Consumer Durables": "NIFTY CONSR DURABLE",
  Infra: "NIFTY INFRA",
  Auto: "NIFTY AUTO",
  "Pvt Banks": "NIFTY BANK",
  "PSU Banks": "NIFTY PSU BANK",
  NBFC: "NIFTY FINSERV",
  Insurance: "NIFTY FINSERV",
  "Capital Markets": "NIFTY FINSERV",
  Healthcare: "NIFTY HEALTHCARE",
  Realty: "NIFTY REALTY",
  IT: "NIFTY IT",
  Pharma: "NIFTY PHARMA",
  Chemicals: "NIFTY CHEMICALS",
  Consumer: "NIFTY CONSUMPTION",
  FMCG: "NIFTY FMCG",
  Cement: "NIFTY CEMENT",
  Metals: "NIFTY METAL",
};

function niftyIndustryGroup(symbol) {
  const industry = INDUSTRY_GROUP[symbol] || "";
  return INDUSTRY_TO_NIFTY_GROUP[industry] || industry;
}

const WEIGHTS = {
  rs: 0.3,
  sector: 0.15,
  volume: 0.2,
  vwap: 0.15,
  freshness: 0.1,
  extension: 0.1,
};
const FRESHNESS_BY_CANDLE = { C1: 100, C2: 75, C3: 50, C4: 25 };

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function signalCandle(signal) {
  const match = /C(\d)/.exec(signal || "");
  return match ? `C${match[1]}` : null;
}

// group -> that sector's mean %change, computed once per `stocks` snapshot
// (reused by every stock in that group) rather than re-aggregating per row.
export function buildSectorMeans(stocks) {
  const groups = new Map();
  for (const s of stocks || []) {
    const group = niftyIndustryGroup(s.symbol);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(s.pct_change || 0);
  }
  const means = new Map();
  for (const [group, pctChanges] of groups) {
    means.set(group, pctChanges.reduce((a, b) => a + b, 0) / pctChanges.length);
  }
  return means;
}

// Percentile rank (0-1) of `value` within `values` — used for the volume
// component so a stock's traded value is scored relative to today's actual
// distribution across the watchlist, not an arbitrary fixed cutoff.
function percentileRank(value, values) {
  if (!values.length) return 0;
  const below = values.filter((v) => v <= value).length;
  return below / values.length;
}

// Returns 0 for anything with no signal or fighting the Nifty direction — a
// hard filter, matching the same against-trend rule WatchlistRow.jsx already
// uses for its warning badge. Otherwise a 0-100 composite score.
export function momentumScore(stock, allStocks, niftyPctChange, sectorMeans) {
  const hasSignal = stock.signal && stock.signal !== "None";
  if (!hasSignal) return 0;
  const isBull = stock.signal.includes("Bull");
  const alignedWithNifty = isBull ? niftyPctChange >= 0 : niftyPctChange <= 0;
  if (!alignedWithNifty) return 0;

  const rsRaw = isBull ? stock.relative_strength : -stock.relative_strength;
  const rsScore = clamp((rsRaw || 0) * 10, 0, 100);

  const group = niftyIndustryGroup(stock.symbol);
  const sectorMeanPct = sectorMeans.get(group) ?? 0;
  const sectorRsRaw = isBull
    ? (stock.pct_change || 0) - sectorMeanPct
    : sectorMeanPct - (stock.pct_change || 0);
  const sectorScore = clamp(sectorRsRaw * 10, 0, 100);

  const tradedValues = (allStocks || [])
    .filter((s) => s.signal && s.signal !== "None")
    .map((s) => s.traded_value || 0);
  const volScore = percentileRank(stock.traded_value || 0, tradedValues) * 100;

  const vwapScore =
    stock.vwap &&
    ((isBull && stock.ltp > stock.vwap) || (!isBull && stock.ltp < stock.vwap))
      ? 100
      : 0;

  const freshnessScore = FRESHNESS_BY_CANDLE[signalCandle(stock.signal)] || 0;

  const extensionScore = 100 - Math.abs((stock.day_range_pos || 0) - 50) * 2;

  return (
    rsScore * WEIGHTS.rs +
    sectorScore * WEIGHTS.sector +
    volScore * WEIGHTS.volume +
    vwapScore * WEIGHTS.vwap +
    freshnessScore * WEIGHTS.freshness +
    clamp(extensionScore, 0, 100) * WEIGHTS.extension
  );
}
