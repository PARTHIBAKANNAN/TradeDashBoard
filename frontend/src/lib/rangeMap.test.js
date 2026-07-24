import { describe, it, expect } from "vitest";
import { rangeMap } from "./rangeMap.js";

// Values mirror backend/tests/test_calculations.py::test_range_map so
// the JS and Python implementations must agree.
describe("rangeMap", () => {
  it("maps yesterday's low to 0 when it is the global min", () => {
    const r = rangeMap(3580, 3690, 3600, 3700, 3690);
    expect(r.yesterday.low).toBeCloseTo(0.0);
  });

  it("maps today's high to 100 when it is the global max", () => {
    const r = rangeMap(3580, 3690, 3600, 3700, 3690);
    expect(r.today.high).toBeCloseTo(100.0);
  });

  it("keeps ltp_pos within [0, 100]", () => {
    const r = rangeMap(3580, 3690, 3600, 3700, 3690);
    expect(r.ltp_pos).toBeGreaterThanOrEqual(0);
    expect(r.ltp_pos).toBeLessThanOrEqual(100);
  });

  it("carries raw prices through unchanged", () => {
    const r = rangeMap(3580, 3690, 3600, 3700, 3690);
    expect(r.yesterday.raw_high).toBe(3690);
    expect(r.today.raw_low).toBe(3600);
  });

  it("handles zero-span (all values equal) without dividing by zero", () => {
    const r = rangeMap(100, 100, 100, 100, 100);
    expect(Number.isFinite(r.ltp_pos)).toBe(true);
  });
});
