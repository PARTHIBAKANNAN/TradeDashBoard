import { describe, it, expect, beforeEach, vi } from "vitest";
import { marketStore } from "./marketStore.js";

const snapshotFrame = {
  type: "snapshot",
  seq: 1,
  market_open: true,
  fyers_connected: true,
  nifty: { symbol: "NIFTY50", ltp: 100, prev_close: 100, pct_change: 0 },
  stocks: [
    { symbol: "RELIANCE", sector: "Energy",
      ltp: 100, pct_change: 0, relative_strength: 0, day_range_pos: 50,
      signal: "None", signal_time: "",
      yesterday_low: 90, yesterday_high: 110, today_low: 95, today_high: 105 },
    { symbol: "TCS", sector: "IT",
      ltp: 4000, pct_change: 0, relative_strength: 0, day_range_pos: 25,
      signal: "None", signal_time: "",
      yesterday_low: 3900, yesterday_high: 4050, today_low: 3950, today_high: 4020 },
  ],
};

beforeEach(() => marketStore.reset());

describe("marketStore.applyFrame", () => {
  it("loads a snapshot into the store", () => {
    marketStore.applyFrame(snapshotFrame);
    expect(marketStore.getStock("RELIANCE").ltp).toBe(100);
    expect(marketStore.getSymbols()).toEqual(["RELIANCE", "TCS"]);
    expect(marketStore.getMeta().lastSeq).toBe(1);
    expect(marketStore.getMeta().marketOpen).toBe(true);
  });

  it("merges a delta into an existing stock", () => {
    marketStore.applyFrame(snapshotFrame);
    marketStore.applyFrame({
      type: "delta", seq: 2,
      stocks: [{ symbol: "RELIANCE", ltp: 101.5, pct_change: 1.5 }],
    });
    const r = marketStore.getStock("RELIANCE");
    expect(r.ltp).toBe(101.5);
    expect(r.pct_change).toBe(1.5);
    expect(r.sector).toBe("Energy"); // untouched fields preserved
    expect(marketStore.getMeta().lastSeq).toBe(2);
  });

  it("snapshot + N deltas equals equivalent single snapshot", () => {
    marketStore.applyFrame(snapshotFrame);
    marketStore.applyFrame({ type: "delta", seq: 2,
      stocks: [{ symbol: "RELIANCE", ltp: 101.0 }] });
    marketStore.applyFrame({ type: "delta", seq: 3,
      stocks: [{ symbol: "TCS", ltp: 4020.0 }] });

    marketStore.reset();
    marketStore.applyFrame({
      ...snapshotFrame,
      seq: 99,
      stocks: [
        { ...snapshotFrame.stocks[0], ltp: 101.0 },
        { ...snapshotFrame.stocks[1], ltp: 4020.0 },
      ],
    });

    expect(marketStore.getStock("RELIANCE").ltp).toBe(101.0);
    expect(marketStore.getStock("TCS").ltp).toBe(4020.0);
  });

  it("subscribeStock fires only when that symbol's fields change", () => {
    marketStore.applyFrame(snapshotFrame);
    const reliance = vi.fn();
    const tcs = vi.fn();
    marketStore.subscribeStock("RELIANCE", reliance);
    marketStore.subscribeStock("TCS", tcs);

    marketStore.applyFrame({ type: "delta", seq: 2,
      stocks: [{ symbol: "RELIANCE", ltp: 101 }] });

    expect(reliance).toHaveBeenCalledTimes(1);
    expect(tcs).not.toHaveBeenCalled();
  });

  it("subscribeSymbols only fires when the symbol set changes", () => {
    marketStore.applyFrame(snapshotFrame);
    const cb = vi.fn();
    marketStore.subscribeSymbols(cb);

    // Same set of symbols → no notification.
    marketStore.applyFrame({ type: "delta", seq: 2,
      stocks: [{ symbol: "RELIANCE", ltp: 105 }] });
    expect(cb).not.toHaveBeenCalled();

    // New symbol appears → notify.
    marketStore.applyFrame({ type: "delta", seq: 3, stocks: [
      { symbol: "INFY", sector: "IT",
        ltp: 1500, pct_change: 0, relative_strength: 0, day_range_pos: 50,
        signal: "None", signal_time: "",
        yesterday_low: 1490, yesterday_high: 1520, today_low: 1495, today_high: 1510 },
    ] });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(marketStore.getSymbols()).toEqual(["INFY", "RELIANCE", "TCS"]);
  });

  it("setConnected notifies meta subscribers without touching stocks", () => {
    marketStore.applyFrame(snapshotFrame);
    const meta = vi.fn();
    const stock = vi.fn();
    marketStore.subscribeMeta(meta);
    marketStore.subscribeStock("RELIANCE", stock);
    marketStore.setConnected(false);
    expect(meta).toHaveBeenCalledTimes(1);
    expect(stock).not.toHaveBeenCalled();
    expect(marketStore.getMeta().connected).toBe(false);
  });
});
