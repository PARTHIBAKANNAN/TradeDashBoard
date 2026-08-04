import { describe, it, expect } from "vitest";
import { momentumScore, buildSectorMeans } from "./momentumScore.js";

function stock(overrides) {
  return {
    symbol: "TEST",
    sector: "IT",
    ltp: 100,
    pct_change: 1,
    relative_strength: 1,
    day_range_pos: 50,
    signal: "Bull • C1",
    traded_value: 1000,
    vwap: 99,
    ...overrides,
  };
}

describe("momentumScore", () => {
  it("scores 0 when there is no signal", () => {
    const s = stock({ signal: "None" });
    expect(momentumScore(s, [s], 0.5, buildSectorMeans([s]))).toBe(0);
  });

  it("scores 0 when the signal fights the Nifty direction", () => {
    const s = stock({ signal: "Bull • C1" });
    // Nifty is down; a Bull signal is against-trend.
    expect(momentumScore(s, [s], -0.5, buildSectorMeans([s]))).toBe(0);
  });

  it("scores above 0 when aligned with Nifty and everything else is favorable", () => {
    const s = stock({ signal: "Bull • C1" });
    const score = momentumScore(s, [s], 0.5, buildSectorMeans([s]));
    expect(score).toBeGreaterThan(0);
  });

  it("rewards stronger RS, holding everything else equal", () => {
    const weak = stock({ relative_strength: 0.5 });
    const strong = stock({ relative_strength: 5 });
    const all = [weak, strong];
    const means = buildSectorMeans(all);
    expect(momentumScore(strong, all, 0.5, means)).toBeGreaterThan(
      momentumScore(weak, all, 0.5, means),
    );
  });

  it("rewards being on the favorable side of VWAP", () => {
    const above = stock({ ltp: 105, vwap: 100 }); // Bull, price above VWAP
    const below = stock({ ltp: 95, vwap: 100 }); // Bull, price below VWAP
    const all = [above, below];
    const means = buildSectorMeans(all);
    expect(momentumScore(above, all, 0.5, means)).toBeGreaterThan(
      momentumScore(below, all, 0.5, means),
    );
  });

  it("penalizes an already-extended day range vs. a mid-range one", () => {
    const midRange = stock({ day_range_pos: 50 });
    const extended = stock({ day_range_pos: 95 });
    const all = [midRange, extended];
    const means = buildSectorMeans(all);
    expect(momentumScore(midRange, all, 0.5, means)).toBeGreaterThan(
      momentumScore(extended, all, 0.5, means),
    );
  });

  it("rewards a fresher (C1) signal over a later one (C4), holding other inputs equal", () => {
    const fresh = stock({ signal: "Bull • C1" });
    const stale = stock({ signal: "Bull • C4" });
    const all = [fresh, stale];
    const means = buildSectorMeans(all);
    expect(momentumScore(fresh, all, 0.5, means)).toBeGreaterThan(
      momentumScore(stale, all, 0.5, means),
    );
  });
});
