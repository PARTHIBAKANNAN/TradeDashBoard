import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  createSeriesMarkers,
} from "lightweight-charts";
import { useTheme } from "../contexts/ThemeContext.jsx";

// Build a UTC timestamp for lightweight-charts from a calendar date + bucket
// (minutes since midnight). The library renders in UTC, so we must express
// IST times as UTC-equivalent offsets: IST = UTC+5:30, so subtract 5h30m.
// bucketDate: "YYYY-MM-DD" string or null (falls back to today)
// bucketMinute: minutes since midnight in IST
function bucketToTimestamp(bucketDate, bucketMinute) {
  let year, month, day;
  if (bucketDate) {
    [year, month, day] = bucketDate.split("-").map(Number);
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
    day = now.getDate();
  }
  // UTC midnight for this calendar date, then add IST bucket offset.
  // IST is UTC+5:30 = 330 minutes ahead, so IST 09:15 = UTC 03:45.
  const utcMidnightMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const istOffsetSeconds = 5 * 3600 + 30 * 60; // 19800s
  return Math.floor(utcMidnightMs / 1000) + bucketMinute * 60 - istOffsetSeconds;
}

// IST open / close expressed as UTC timestamps for a given calendar date —
// used to pin the visible range to a full trading day (Groww-style).
function dayBoundaries(bucketDate) {
  const open = bucketToTimestamp(bucketDate, 9 * 60 + 15);  // 09:15 IST
  const close = bucketToTimestamp(bucketDate, 15 * 60 + 30); // 15:30 IST
  return { open, close };
}

function readCandleColors() {
  const styles = getComputedStyle(document.documentElement);
  const getRgb = (prop, fallback) => {
    const raw = (styles.getPropertyValue(prop) || "").trim();
    if (!raw) return fallback;
    if (raw.startsWith("#") || raw.startsWith("rgb")) return raw;
    const formatted = raw.replace(/\s+/g, ", ");
    return `rgb(${formatted})`;
  };

  const up = getRgb("--bull-strong", "rgb(16, 185, 129)");
  const down = getRgb("--bear-strong", "rgb(244, 63, 94)");
  return { up, down };
}

function formatDelta(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

const MIN_PX_PER_BAR_FOR_LABELS = 32;

const LEVEL_LINES = [
  { key: "opening_range_high", color: "#22c55e", title: "OR High" },
  { key: "opening_range_low", color: "#ef4444", title: "OR Low" },
  { key: "prev_day_high", color: "#f59e0b", title: "Prev Day High" },
  { key: "prev_day_low", color: "#f59e0b", title: "Prev Day Low" },
  { key: "pivot", color: "#8b5cf6", title: "Pivot" },
];

// Real candlestick chart backed by lightweight-charts. Created once per mount.
// Props:
//   candles      — array of {bucket_date?, bucket_minute, open, high, low, close, delta}
//   levels       — {opening_range_high, opening_range_low, prev_day_high, prev_day_low, pivot}
//   position     — open paper-trade position for Entry/SL/Target lines
//   height       — CSS height in px (default 360)
//   multiDay     — if true, do NOT pin the visible range to a single day; show all data
//   candleDate   — "YYYY-MM-DD" string for the currently displayed day (for axis pin + badge)
//   isPreviousDay — if true, show an amber "PREV DAY" badge
export default function CandleChart({
  candles,
  levels,
  position,
  height = 360,
  multiDay = false,
  candleDate = null,
  isPreviousDay = false,
}) {
  const { theme } = useTheme();
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const deltaSeriesRef = useRef(null);
  const deltaMarkersRef = useRef(null);
  const deltaDataRef = useRef([]);
  const labelsVisibleRef = useRef(false);
  const priceLinesRef = useRef([]);
  const positionLinesRef = useRef([]);
  const levelValuesRef = useRef([]);
  const positionValuesRef = useRef([]);
  const candlesInitializedRef = useRef(false);
  const prevCandleCountRef = useRef(0);
  const deltaInitializedRef = useRef(false);
  const prevDeltaCountRef = useRef(0);
  const deltaThemeRef = useRef(theme);
  const levelsFitRef = useRef(false);
  const [latestDelta, setLatestDelta] = useState(0);
  const [hoveredDelta, setHoveredDelta] = useState(null);

  function applyDeltaMarkers() {
    const markers = deltaMarkersRef.current;
    if (!markers) return;
    if (!labelsVisibleRef.current || !deltaDataRef.current.length) {
      markers.setMarkers([]);
      return;
    }
    markers.setMarkers(
      deltaDataRef.current.map((d) => ({
        time: d.time,
        position: d.value >= 0 ? "aboveBar" : "belowBar",
        color: d.color,
        shape: "circle",
        size: 0,
        text: formatDelta(d.value),
      })),
    );
  }

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
    series.applyOptions({
      autoscaleInfoProvider: (original) => {
        const res = original();
        if (!res || !res.priceRange) return res;
        // Only include active paper trade position lines in autoscale if present,
        // so distant reference levels don't squish the candles into a tiny strip.
        const values = [...positionValuesRef.current];
        if (!values.length) return res;
        const minValue = Math.min(res.priceRange.minValue, ...values);
        const maxValue = Math.max(res.priceRange.maxValue, ...values);
        return { priceRange: { minValue, maxValue }, margins: res.margins };
      },
    });
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

    const deltaMarkers = createSeriesMarkers(deltaSeries, []);

    const onCrosshairMove = (param) => {
      if (!param.time) {
        setHoveredDelta(null);
        return;
      }
      const point = param.seriesData.get(deltaSeries);
      setHoveredDelta(typeof point?.value === "number" ? point.value : null);
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    const handleVisibleRangeChange = () => {
      const ts = chartRef.current?.timeScale();
      if (!ts) return;
      const range = ts.getVisibleLogicalRange();
      if (!range) return;
      const barSpan = range.to - range.from;
      const pxWidth = ts.width();
      const perBarPx = barSpan > 0 ? pxWidth / barSpan : 0;
      const shouldShow = perBarPx >= MIN_PX_PER_BAR_FOR_LABELS;
      if (shouldShow === labelsVisibleRef.current) return;
      labelsVisibleRef.current = shouldShow;
      applyDeltaMarkers();
    };
    chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    chartRef.current = chart;
    seriesRef.current = series;
    deltaSeriesRef.current = deltaSeries;
    deltaMarkersRef.current = deltaMarkers;

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      deltaSeriesRef.current = null;
      deltaMarkersRef.current = null;
      priceLinesRef.current = [];
      positionLinesRef.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme change → recolor in place.
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
      layout: { textColor: isDark ? "#a1a1aa" : "#52525b" },
      grid: {
        horzLines: {
          color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
        },
      },
    });
  }, [theme]);

  // Candle data. First load → setData + fit/pin. Subsequent updates → series.update().
  useEffect(() => {
    if (!seriesRef.current) return;
    const data = (candles || [])
      .map((c) => ({
        time: bucketToTimestamp(c.bucket_date || candleDate, c.bucket_minute),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .sort((a, b) => a.time - b.time);
    if (data.length === 0) return;

    const prevLen = prevCandleCountRef.current;
    if (!candlesInitializedRef.current) {
      seriesRef.current.setData(data);
      if (multiDay) {
        // Multi-day mode: show all data, let user pan/zoom freely.
        chartRef.current?.timeScale().fitContent();
      } else {
        // Single-day mode (Groww-style): pin x-axis to full trading day
        // (09:15–15:30 IST) so candles appear small on the left with the
        // full day's time axis visible even when only 1–2 candles exist.
        const date = (candles[0]?.bucket_date) || candleDate || null;
        const { open, close } = dayBoundaries(date);
        try {
          chartRef.current?.timeScale().setVisibleRange({ from: open, to: close });
        } catch {
          chartRef.current?.timeScale().fitContent();
        }
      }
      candlesInitializedRef.current = true;
    } else if (data.length === prevLen || data.length === prevLen + 1) {
      seriesRef.current.update(data[data.length - 1]);
    } else {
      seriesRef.current.setData(data);
    }
    prevCandleCountRef.current = data.length;
  }, [candles]); // eslint-disable-line react-hooks/exhaustive-deps

  // CVD histogram.
  useEffect(() => {
    if (!deltaSeriesRef.current) return;
    const { up, down } = readCandleColors();
    let cumulative = 0;
    const data = (candles || [])
      .map((c) => {
        cumulative += c.delta || 0;
        return {
          time: bucketToTimestamp(c.bucket_date || candleDate, c.bucket_minute),
          value: cumulative,
          color: cumulative >= 0 ? up : down,
        };
      })
      .sort((a, b) => a.time - b.time);
    setLatestDelta(cumulative);
    deltaDataRef.current = data;
    if (data.length === 0) return;

    const prevLen = prevDeltaCountRef.current;
    const themeChanged = deltaThemeRef.current !== theme;
    deltaThemeRef.current = theme;
    if (!deltaInitializedRef.current || themeChanged) {
      deltaSeriesRef.current.setData(data);
      deltaInitializedRef.current = true;
    } else if (data.length === prevLen || data.length === prevLen + 1) {
      deltaSeriesRef.current.update(data[data.length - 1]);
    } else {
      deltaSeriesRef.current.setData(data);
    }
    prevDeltaCountRef.current = data.length;
    applyDeltaMarkers();
  }, [candles, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reference-level lines (OR High/Low, Prev Day High/Low, Pivot).
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
            axisLabelVisible: false, // Keep price axis scale clean & un-cluttered
            title,
          }),
        );
      });
    }
    levelValuesRef.current = values;
  }, [levels]);

  // Open paper-trade position lines.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    positionLinesRef.current.forEach((line) => series.removePriceLine(line));
    positionLinesRef.current = [];
    const values = [];
    if (position) {
      const isTsl = position.tsl_type && position.tsl_type !== "NONE";
      const isBuy = position.side === "BUY";
      const entries = [
        { price: position.entry_price, color: "#60a5fa", title: "Entry" },
        {
          price: position.sl_price,
          color: "#ef4444",
          title: isTsl ? "TSL" : "SL",
        },
        { price: position.target_price, color: "#22c55e", title: "Target" },
      ];
      entries.forEach(({ price, color, title }) => {
        if (price == null) return;
        values.push(price);
        positionLinesRef.current.push(
          series.createPriceLine({
            price,
            color,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `${title} (${isBuy ? "Long" : "Short"})`,
          }),
        );
      });
    }
    positionValuesRef.current = values;
  }, [
    position?.entry_price,
    position?.sl_price,
    position?.target_price,
    position?.tsl_type,
    position?.side,
  ]);

  const displayDelta = hoveredDelta ?? latestDelta;
  const isHovering = hoveredDelta != null;

  return (
    <div className="relative w-full h-full">
      {/* CVD badge */}
      <div
        className={`absolute top-1.5 right-2.5 z-10 pointer-events-none rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold transition-colors ${
          isHovering
            ? "border-accent-blue/50 bg-surface3/95 text-accent-blue"
            : "border-subtle bg-surface3/80 text-muted"
        }`}
      >
        CVD {formatDelta(displayDelta)}
      </div>
      {/* Previous-day badge */}
      {isPreviousDay && (
        <div className="absolute top-1.5 left-2.5 z-10 pointer-events-none rounded-md border border-accent-amber/40 bg-accent-amber/10 px-2 py-0.5 text-[10px] font-bold text-accent-amber">
          PREV DAY{candleDate ? ` — ${candleDate}` : ""}
        </div>
      )}
      <div ref={containerRef} style={{ height }} className="w-full" />
    </div>
  );
}
