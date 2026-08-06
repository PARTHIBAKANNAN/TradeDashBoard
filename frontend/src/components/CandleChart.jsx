import React, { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
} from "lightweight-charts";
import { useTheme } from "../contexts/ThemeContext.jsx";

// `bucket` is minutes-since-midnight on the browser's own local clock, same
// assumption candleMerge.js/useMarketStream.js already make (browser-local
// reads as IST) — Date.getTime() gives the correct absolute instant from
// local components, and the library renders labels back in the same local
// timezone by default, so this round-trips correctly with zero explicit
// timezone conversion, consistent with every other candle computation here.
function bucketToTime(bucket) {
  const now = new Date();
  const d = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  d.setMinutes(bucket);
  return Math.floor(d.getTime() / 1000);
}

function readCandleColors() {
  const styles = getComputedStyle(document.documentElement);
  const up = `rgb(${styles.getPropertyValue("--bull-strong").trim() || "16 185 129"})`;
  const down = `rgb(${styles.getPropertyValue("--bear-strong").trim() || "244 63 94"})`;
  return { up, down };
}

// Opening-range (09:15-09:45) + previous-day high/low, drawn full chart width
// — both already computed by the existing signal engine, just exposed here.
const LEVEL_LINES = [
  { key: "opening_range_high", color: "#f59e0b", title: "OR High" },
  { key: "opening_range_low", color: "#f59e0b", title: "OR Low" },
  { key: "prev_day_high", color: "#8b5cf6", title: "Prev Day High" },
  { key: "prev_day_low", color: "#8b5cf6", title: "Prev Day Low" },
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
  const priceLinesRef = useRef([]);
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
        horzLines: {
          color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
        },
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
    // Cumulative-delta histogram in its own pane below the candles — a
    // separate price scale, not overlaid on the price axis. Per-bar color is
    // set individually in the data itself (unlike the candlestick series),
    // so no up/down color options are needed here.
    const deltaSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1,
    );
    const panes = chart.panes();
    if (panes[0]) panes[0].setStretchFactor(3);
    if (panes[1]) panes[1].setStretchFactor(1);

    chartRef.current = chart;
    seriesRef.current = series;
    deltaSeriesRef.current = deltaSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      deltaSeriesRef.current = null;
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
        horzLines: {
          color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
        },
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
  // reads green (matches how the reference tool colors it).
  useEffect(() => {
    if (!deltaSeriesRef.current) return;
    const { up, down } = readCandleColors();
    let cumulative = 0;
    const data = (candles || [])
      .map((c) => {
        cumulative += c.delta || 0;
        return {
          time: bucketToTime(c.bucket),
          value: cumulative,
          color: cumulative >= 0 ? up : down,
        };
      })
      .sort((a, b) => a.time - b.time);
    deltaSeriesRef.current.setData(data);
  }, [candles, theme]);

  // Reference-line levels (opening range + prev-day high/low).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    priceLinesRef.current.forEach((line) => series.removePriceLine(line));
    priceLinesRef.current = [];
    if (!levels) return;
    LEVEL_LINES.forEach(({ key, color, title }) => {
      const price = levels[key];
      if (price == null) return;
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
  }, [levels]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
