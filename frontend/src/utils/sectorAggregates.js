import { niftyGroup } from "./sectorGroups.js";

// Groups stocks by their NIFTY-style display group (see sectorGroups.js).
export function groupBySector(stocks) {
  const groups = new Map();
  for (const s of stocks || []) {
    const group = niftyGroup(s.sector);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(s);
  }
  return groups;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Per-group stats. `mean` is the simple average %change across members (used
// for ranking "how did the average stock in this sector do" — a leaderboard).
// `weightedMean` is traded-value-weighted (used for the treemap tile color —
// "how did the sector's money move"). These intentionally differ: a single
// heavy-volume stock shouldn't dominate the leaderboard read.
export function aggregate(members) {
  const pctChanges = members.map((s) => s.pct_change || 0);
  const totalTradedValue = members.reduce((sum, s) => sum + (s.traded_value || 0), 0);
  const mean = pctChanges.length ? pctChanges.reduce((a, b) => a + b, 0) / pctChanges.length : 0;

  let weightedMean = mean; // fall back to simple mean when there's no traded value yet
  if (totalTradedValue > 0) {
    const weightedSum = members.reduce(
      (sum, s) => sum + (s.pct_change || 0) * (s.traded_value || 0),
      0
    );
    weightedMean = weightedSum / totalTradedValue;
  }

  return {
    mean: round2(mean),
    weightedMean: round2(weightedMean),
    median: round2(median(pctChanges)),
    totalTradedValue,
    count: members.length,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Convenience: all sector groups with their aggregates, in one pass.
export function sectorAggregates(stocks) {
  const groups = groupBySector(stocks);
  return Array.from(groups.entries()).map(([group, members]) => ({
    group,
    members,
    ...aggregate(members),
  }));
}
