import React, { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  createSeriesMarkers,
} from "lightweight-charts";
import { useTheme } from "../contexts/ThemeContext.jsx";

// `bucket` is minutes-since-midnight IST. lightweight-charts renders
// UTCTimestamp labels in UTC, NOT the browser's local timezone (confirmed via
// the reported bug: 09:15 IST was rendering as 03:45) — so building the
// epoch from the browser's *local* wall-clock (as this used to) only round-
// trips correctly when the browser's local zone happens to be UTC. Building
// it from UTC components instead makes the library's UTC-labeled display
// show the correct IST time regardless of the browser's own timezone.
function bucketToTime(bucket) {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return Math.floor(utcMidnight / 1000) + bucket * 60;
}

function readCandleColors() {
  const styles = getComputedStyle(document.documentElement);
  const up = `rgb(${styles.getPropertyValue("--bull-strong").trim() || "16 185 129"})`;
  const down = `rgb(${styles.getPropertyValue("--bear-strong").trim() || "244 63 94"})`;
  return { up, down };
}

function formatDelta(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

// Opening-range (09:15-09:45), previous-day high/low + pivot, drawn full
// chart width — all already computed by the existing signal engine, just
// exposed here.
const LEVEL_LINES = [
  { key: "opening_range_high", color: "#22c55e", title: "OR High" },
  { key: "opening_range_low", color: "#ef4444", title: "OR Low" },
  { key: "prev_day_high", color: "#f59e0b", title: "Prev Day High" },
  { key: "prev_day_low", color: "#f59e0b", title: "Prev Day Low" },
  { key: "pivot", color: "#8b5cf6", title: "Pivot" },
];

// Real candlestick chart with pan/zoom/crosshair, backed by lightweight-charts.
// The chart instance is created ONCE per mount (i.e. once per scroll-into-view
// in the Charts feed, not once per data update) and updated imperatively —
// remounting it per tick/data-change would reset pan/zoom state and feel
// jarring instead of seamless.
export default function CandleChart({ candles, levels, height = 360 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const deltaSeriesRef = useRef(null);
  const deltaMarkersRef = useRef(null);
  const priceLinesRef = useRef([]);
  const levelValuesRef = useRef([]);
  const { theme } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { up, down } = readCandleColors();
    const isDark = theme === "dark";

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#a1a1aa" : "#52525b",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    });
    // Reference-line prices aren't included in the series' autoscale range by
    // default, so a line outside the candles' own high/low gets scrolled off
    // the visible price axis. Widen the computed range to also cover them.
    series.applyOptions({
      autoscaleInfoProvider: (original) => {
        const res = original();
        if (!res || !res.priceRange) return res;
        const values = levelValuesRef.current;
        if (!values.length) return res;
        const minValue = Math.min(res.priceRange.minValue, ...values);
        const maxValue = Math.max(res.priceRange.maxValue, ...values);
        return { priceRange: { minValue, maxValue }, margins: res.margins };
      },
    });
    // Cumulative-delta histogram in its own pane below the candles — a
    // separate price scale, not overlaid on the price axis. Per-bar color is
    // set individually in the data itself (unlike the candlestick series),
    // so no up/down color options are needed here.
    const deltaSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
      1,
    );
    // Text-only value labels per bar (size: 0 hides the marker shape itself).
    const deltaMarkers = createSeriesMarkers(deltaSeries, []);
    const panes = chart.panes();
    if (panes[0]) panes[0].setStretchFactor(3);
    if (panes[1]) panes[1].setStretchFactor(1);

    chartRef.current = chart;
    seriesRef.current = series;
    deltaSeriesRef.current = deltaSeries;
    deltaMarkersRef.current = deltaMarkers;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      deltaSeriesRef.current = null;
      deltaMarkersRef.current = null;
      priceLinesRef.current = [];
    };
    // Deliberately create-once: theme/candles/levels are applied imperatively
    // in the effects below instead of tearing down and rebuilding the chart.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme change -> recolor in place, no chart recreation.
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const { up, down } = readCandleColors();
    const isDark = theme === "dark";
    seriesRef.current.applyOptions({
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    });
    chartRef.current.applyOptions({
      layout: {
        textColor: isDark ? "#a1a1aa" : "#52525b",
      },
      grid: {
        horzLines: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
      },
    });
  }, [theme]);

  // Candle data.
  useEffect(() => {
    if (!seriesRef.current) return;
    const data = (candles || [])
      .map((c) => ({
        time: bucketToTime(c.bucket),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .sort((a, b) => a.time - b.time);
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Cumulative tick-rule delta, one histogram bar per candle — colored by
  // the sign of the running total, not the per-bar delta, so a string of
  // small down-ticks that hasn't yet erased the day's net buying still
  // reads green (matches how the reference tool colors it). Each bar also
  // gets a text-only marker showing the actual cumulative value.
  useEffect(() => {
    if (!deltaSeriesRef.current) return;
    const { up, down } = readCandleColors();
    let cumulative = 0;
    const data = (candles || [])
      .map((c) => {
        cumulative += c.delta || 0;
        return { time: bucketToTime(c.bucket), value: cumulative, color: cumulative >= 0 ? up : down };
      })
      .sort((a, b) => a.time - b.time);
    deltaSeriesRef.current.setData(data);
    deltaMarkersRef.current?.setMarkers(
      data.map((d) => ({
        time: d.time,
        position: d.value >= 0 ? "aboveBar" : "belowBar",
        color: d.color,
        shape: "circle",
        size: 0,
        text: formatDelta(d.value),
      })),
    );
  }, [candles, theme]);

  // Reference-line levels (opening range, prev-day high/low, pivot).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    priceLinesRef.current.forEach((line) => series.removePriceLine(line));
    priceLinesRef.current = [];
    const values = [];
    if (levels) {
      LEVEL_LINES.forEach(({ key, color, title }) => {
        const price = levels[key];
        if (price == null) return;
        values.push(price);
        priceLinesRef.current.push(
          series.createPriceLine({
            price,
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title,
          }),
        );
      });
    }
    levelValuesRef.current = values;
    chartRef.current?.timeScale().fitContent();
  }, [levels]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
