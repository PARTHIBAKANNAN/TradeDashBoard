import { describe, it, expect } from "vitest";
import {
  today,
  yesterday,
  thisWeek,
  lastWeek,
  thisMonth,
  lastNDays,
  PRESETS,
} from "./dateRanges.js";

describe("dateRanges", () => {
  it("today spans midnight to now", () => {
    const { from, to } = today();
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(from.toDateString()).toBe(new Date().toDateString());
    expect(to.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("yesterday is exactly one calendar day before today, full day", () => {
    const { from, to } = yesterday();
    const expectedDay = new Date();
    expectedDay.setDate(expectedDay.getDate() - 1);
    expect(from.toDateString()).toBe(expectedDay.toDateString());
    expect(to.toDateString()).toBe(expectedDay.toDateString());
    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(23);
  });

  it("thisWeek starts on a Monday", () => {
    const { from } = thisWeek();
    expect(from.getDay()).toBe(1); // Monday
  });

  it("lastWeek is the 7 days immediately before this week's Monday", () => {
    const { from: thisMonday } = thisWeek();
    const { from, to } = lastWeek();
    expect(from.getDay()).toBe(1); // also a Monday
    expect(to.getTime()).toBeLessThan(thisMonday.getTime());
    const spanDays = Math.round(
      (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(spanDays).toBeGreaterThanOrEqual(6); // ~7 days, inclusive of end-of-day rounding
  });

  it("thisMonth starts on the 1st", () => {
    const { from } = thisMonth();
    expect(from.getDate()).toBe(1);
  });

  it("lastNDays(30) starts exactly 29 calendar days before today (30 days inclusive)", () => {
    const { from } = lastNDays(30);
    const expected = new Date();
    expected.setDate(expected.getDate() - 29);
    expect(from.toDateString()).toBe(expected.toDateString());
    expect(from.getHours()).toBe(0);
  });

  it("exposes all 7 required presets", () => {
    const keys = PRESETS.map((p) => p.key);
    expect(keys).toEqual([
      "today",
      "yesterday",
      "thisWeek",
      "lastWeek",
      "thisMonth",
      "last30",
      "last60",
    ]);
    for (const preset of PRESETS) {
      const { from, to } = preset.range();
      expect(from).toBeInstanceOf(Date);
      expect(to).toBeInstanceOf(Date);
      expect(from.getTime()).toBeLessThanOrEqual(to.getTime());
    }
  });
});
