import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  createSeriesMarkers,
} from "lightweight-charts";
import { useTheme } from "../contexts/ThemeContext.jsx";

// Build a UTC timestamp for lightweight-charts from a calendar date + bucket
function bucketToTimestamp(bucketDate, bucketMinute) {
  let year, month, day;
  if (bucketDate && typeof bucketDate === "string" && bucketDate.includes("-")) {
    const parts = bucketDate.split("-").map(Number);
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
    day = now.getDate();
  }
  const min =
    typeof bucketMinute === "number" && !isNaN(bucketMinute)
      ? bucketMinute
      : 0;
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  const ts = Math.floor(Date.UTC(year, month - 1, day, hours, minutes, 0) / 1000);
  return Number.isInteger(ts) && ts > 0 ? ts : Math.floor(Date.now() / 1000);
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

export default function CandleChart({
  candles,
  levels,
  position,
  height = 360,
  multiDay = false,
  candleDate = null,
  isPreviousDay = false,
}) {
  const { theme, isDark, activeChartPalette } = useTheme();
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

  const [latestDelta, setLatestDelta] = useState(0);
  const [hoveredDelta, setHoveredDelta] = useState(null);
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const [positionCoords, setPositionCoords] = useState(null);

  // Compute latest candle for default OHLC banner
  const latestCandle = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    return candles[candles.length - 1];
  }, [candles]);

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

  // Update TradingView Long & Short Position Tool Overlay coordinates
  const updatePositionOverlay = () => {
    if (!position || !seriesRef.current || !chartRef.current) {
      setPositionCoords(null);
      return;
    }
    const series = seriesRef.current;
    const chart = chartRef.current;
    const timeScale = chart.timeScale();

    const entry = Number(position.entry_price);
    const sl = position.sl_price != null ? Number(position.sl_price) : null;
    const target =
      position.target_price != null ? Number(position.target_price) : null;

    if (!entry || !sl || !target) {
      setPositionCoords(null);
      return;
    }

    const yEntry = series.priceToCoordinate(entry);
    const yTarget = series.priceToCoordinate(target);
    const ySl = series.priceToCoordinate(sl);

    if (yEntry == null || yTarget == null || ySl == null) {
      setPositionCoords(null);
      return;
    }

    const isBuy = position.side === "BUY";
    const riskPts = isBuy ? entry - sl : sl - entry;
    const targetPts = isBuy ? target - entry : entry - target;
    const rrRatio = riskPts > 0 ? (targetPts / riskPts).toFixed(2) : "2.0";

    const chartWidth = timeScale.width();
    let x1 = 30;
    if (position.placed_at) {
      const dateObj = new Date(position.placed_at);
      const ts = Math.floor(dateObj.getTime() / 1000);
      const coord = timeScale.timeToCoordinate(ts);
      if (coord != null && coord > 0 && coord < chartWidth) {
        x1 = Math.max(coord, 20);
      }
    }
    const x2 = Math.max(chartWidth - 56, x1 + 80);

    const isBreakeven = isBuy ? sl >= entry : sl <= entry;
    const tslActive = Boolean(
      position.tsl_type && position.tsl_type !== "NONE",
    );

    setPositionCoords({
      x1,
      x2,
      width: Math.max(x2 - x1, 80),
      yEntry,
      yTarget,
      ySl,
      entry,
      target,
      sl,
      isBuy,
      quantity: position.quantity || 1,
      riskPts,
      targetPts,
      rrRatio,
      isBreakeven,
      tslActive,
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const up = activeChartPalette.upColor;
    const down = activeChartPalette.downColor;
    const bgColor =
      activeChartPalette.bgColor === "transparent"
        ? "transparent"
        : activeChartPalette.bgColor;
    const gridColor = activeChartPalette.gridColor;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: bgColor },
        textColor: isDark ? "#94a3b8" : "#475569",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: gridColor },
      },
      crosshair: {
        // Mode 0: CrosshairMode.Normal - Free-flow 2D cursor movement without magnetic wick snapping
        mode: 0,
        vertLine: {
          color: isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.25)",
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.25)",
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true, // Smooth horizontal single-finger pan across history
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true, // Only 2-finger pinch zooms; stops erratic candle shrinking on swipe
      },
      localization: {
        timeFormatter: (timestamp) => {
          const d = new Date(timestamp * 1000);
          const h = String(d.getUTCHours()).padStart(2, "0");
          const m = String(d.getUTCMinutes()).padStart(2, "0");
          return `${h}:${m}`;
        },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        minBarSpacing: 3,
        fixLeftEdge: !multiDay,
        lockVisibleTimeRangeOnResize: true,
        rightOffset: 12,
        tickMarkFormatter: (time, tickMarkType) => {
          const d = new Date(time * 1000);
          const h = String(d.getUTCHours()).padStart(2, "0");
          const m = String(d.getUTCMinutes()).padStart(2, "0");
          const months = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];
          if (tickMarkType === 0) return `${d.getUTCFullYear()}`;
          if (tickMarkType === 1 || tickMarkType === 2) {
            return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${h}:${m}`;
          }
          return `${h}:${m}`;
        },
      },
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

    // Free-flow crosshair tracking for live continuous OHLC header
    const onCrosshairMove = (param) => {
      if (!param.time) {
        setHoveredDelta(null);
        setHoveredCandle(null);
        return;
      }
      const dPoint = param.seriesData.get(deltaSeries);
      setHoveredDelta(typeof dPoint?.value === "number" ? dPoint.value : null);

      const cPoint = param.seriesData.get(series);
      if (cPoint && typeof cPoint.close === "number") {
        setHoveredCandle({
          open: cPoint.open,
          high: cPoint.high,
          low: cPoint.low,
          close: cPoint.close,
          time: param.time,
        });
      } else {
        setHoveredCandle(null);
      }
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
      if (shouldShow !== labelsVisibleRef.current) {
        labelsVisibleRef.current = shouldShow;
        applyDeltaMarkers();
      }
      updatePositionOverlay();
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

  // Recolor whenever theme or active palette changes
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const up = activeChartPalette.upColor;
    const down = activeChartPalette.downColor;
    const bgColor =
      activeChartPalette.bgColor === "transparent"
        ? "transparent"
        : activeChartPalette.bgColor;
    const gridColor = activeChartPalette.gridColor;

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
        background: { color: bgColor },
        textColor: isDark ? "#94a3b8" : "#475569",
      },
      grid: {
        horzLines: { color: gridColor },
      },
    });
    updatePositionOverlay();
  }, [theme, isDark, activeChartPalette]);

  // Candle data
  useEffect(() => {
    if (!seriesRef.current) return;
    const rawData = (candles || [])
      .map((c) => {
        const minute =
          typeof c.bucket_minute === "number"
            ? c.bucket_minute
            : typeof c.bucket === "number"
              ? c.bucket
              : 0;
        return {
          time: bucketToTimestamp(c.bucket_date || candleDate, minute),
          open: Number(c.open || 0),
          high: Number(c.high || 0),
          low: Number(c.low || 0),
          close: Number(c.close || 0),
        };
      })
      .filter((c) => Number.isInteger(c.time) && c.time > 0 && c.open > 0)
      .sort((a, b) => a.time - b.time);

    // Strict deduplication by timestamp: lightweight-charts crashes if two items share time!
    const uniqueMap = new Map();
    for (const item of rawData) {
      uniqueMap.set(item.time, item);
    }
    const data = Array.from(uniqueMap.values());
    if (data.length === 0) return;

    const prevLen = prevCandleCountRef.current;
    try {
      if (!candlesInitializedRef.current) {
        seriesRef.current.setData(data);
        if (multiDay) {
          chartRef.current?.timeScale().fitContent();
        } else {
          chartRef.current?.timeScale().applyOptions({
            barSpacing: 8,
            minBarSpacing: 3,
            fixLeftEdge: true,
            rightOffset: 12,
          });
          chartRef.current?.timeScale().scrollToPosition(0, false);
        }
        candlesInitializedRef.current = true;
      } else if (data.length === prevLen || data.length === prevLen + 1) {
        seriesRef.current.update(data[data.length - 1]);
      } else {
        seriesRef.current.setData(data);
        if (!multiDay) {
          chartRef.current?.timeScale().applyOptions({
            barSpacing: 8,
            minBarSpacing: 3,
            fixLeftEdge: true,
            rightOffset: 12,
          });
        }
      }
    } catch (err) {
      console.warn("CandleChart setData error caught gracefully:", err);
    }
    prevCandleCountRef.current = data.length;
    setTimeout(updatePositionOverlay, 50);
  }, [candles]); // eslint-disable-line react-hooks/exhaustive-deps

  // CVD Histogram
  useEffect(() => {
    if (!deltaSeriesRef.current) return;
    const up = activeChartPalette.upColor;
    const down = activeChartPalette.downColor;
    let cumulative = 0;
    const rawDelta = (candles || [])
      .map((c) => {
        cumulative += c.delta || 0;
        const minute =
          typeof c.bucket_minute === "number"
            ? c.bucket_minute
            : typeof c.bucket === "number"
              ? c.bucket
              : 0;
        return {
          time: bucketToTimestamp(c.bucket_date || candleDate, minute),
          value: cumulative,
          color: cumulative >= 0 ? up : down,
        };
      })
      .filter((c) => Number.isInteger(c.time) && c.time > 0)
      .sort((a, b) => a.time - b.time);

    const uniqueDeltaMap = new Map();
    for (const item of rawDelta) {
      uniqueDeltaMap.set(item.time, item);
    }
    const data = Array.from(uniqueDeltaMap.values());
    setLatestDelta(cumulative);
    deltaDataRef.current = data;
    if (data.length === 0) return;

    const prevLen = prevDeltaCountRef.current;
    try {
      if (!deltaInitializedRef.current) {
        deltaSeriesRef.current.setData(data);
        deltaInitializedRef.current = true;
      } else if (data.length === prevLen || data.length === prevLen + 1) {
        deltaSeriesRef.current.update(data[data.length - 1]);
      } else {
        deltaSeriesRef.current.setData(data);
      }
    } catch (err) {
      console.warn("CandleChart CVD setData error caught gracefully:", err);
    }
    prevDeltaCountRef.current = data.length;
    applyDeltaMarkers();
  }, [candles, activeChartPalette]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reference-level lines
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
            axisLabelVisible: false,
            title,
          }),
        );
      });
    }
    levelValuesRef.current = values;
  }, [levels]);

  // Open position price scale pins
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    positionLinesRef.current.forEach((line) => series.removePriceLine(line));
    positionLinesRef.current = [];
    const values = [];
    if (position) {
      const isTsl = position.tsl_type && position.tsl_type !== "NONE";
      const isBuy = position.side === "BUY";
      const entry = Number(position.entry_price);
      const sl = position.sl_price != null ? Number(position.sl_price) : null;
      const target =
        position.target_price != null ? Number(position.target_price) : null;

      const isBreakeven = sl != null && (isBuy ? sl >= entry : sl <= entry);
      const slTitle = isBreakeven ? `🛡️ Breakeven SL` : isTsl ? `TSL` : `SL`;
      const slColor = isBreakeven ? "#10b981" : "#ef4444";

      const entries = [
        {
          price: entry,
          color: "#3b82f6",
          title: `Entry (${isBuy ? "Long" : "Short"})`,
          lineStyle: LineStyle.Dashed,
          lineWidth: 2,
        },
        {
          price: sl,
          color: slColor,
          title: slTitle,
          lineStyle: LineStyle.Solid,
          lineWidth: 2,
        },
        {
          price: target,
          color: "#10b981",
          title: `Target`,
          lineStyle: LineStyle.Dashed,
          lineWidth: 2,
        },
      ];

      entries.forEach(({ price, color, title, lineStyle, lineWidth }) => {
        if (price == null || isNaN(price)) return;
        values.push(price);
        positionLinesRef.current.push(
          series.createPriceLine({
            price,
            color,
            lineWidth: lineWidth || 2,
            lineStyle: lineStyle || LineStyle.Solid,
            axisLabelVisible: true,
            title,
          }),
        );
      });
    }
    positionValuesRef.current = values;
    updatePositionOverlay();
  }, [
    position?.entry_price,
    position?.sl_price,
    position?.target_price,
    position?.tsl_type,
    position?.side,
  ]);

  const displayDelta = hoveredDelta ?? latestDelta;
  const isHovering = hoveredDelta != null;

  // Active bar for OHLC banner (hovered or latest)
  const displayBar = hoveredCandle || latestCandle;
  const barDiff = displayBar ? displayBar.close - displayBar.open : 0;
  const barPct =
    displayBar && displayBar.open > 0 ? (barDiff / displayBar.open) * 100 : 0;
  const isBarPos = barDiff >= 0;

  return (
    <div className="relative w-full h-full">
      {/* Real-time Free-Flow OHLC Header Banner */}
      {displayBar && (
        <div className="absolute top-2 left-3 z-20 pointer-events-none flex items-center gap-2 sm:gap-3 text-[11px] font-mono bg-surface2/90 border border-subtle/80 px-2.5 py-1 rounded-lg backdrop-blur-md shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-faint">O</span>
            <span className="text-primary font-semibold">
              ₹
              {displayBar.open.toLocaleString("en-IN", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-faint">H</span>
            <span className="text-primary font-semibold">
              ₹
              {displayBar.high.toLocaleString("en-IN", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-faint">L</span>
            <span className="text-primary font-semibold">
              ₹
              {displayBar.low.toLocaleString("en-IN", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-faint">C</span>
            <span className="text-primary font-bold">
              ₹
              {displayBar.close.toLocaleString("en-IN", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div
            className={`font-bold flex items-center gap-0.5 ${
              isBarPos ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            <span>{isBarPos ? "▲" : "▼"}</span>
            <span>
              {isBarPos ? "+" : ""}
              {barDiff.toFixed(2)}
            </span>
            <span>
              ({isBarPos ? "+" : ""}
              {barPct.toFixed(2)}%)
            </span>
          </div>
        </div>
      )}

      {/* CVD Badge */}
      <div
        className={`absolute top-2 right-3 z-20 pointer-events-none rounded-lg border px-2.5 py-1 text-[11px] font-mono font-bold transition-colors backdrop-blur-md ${
          isHovering
            ? "border-blue-500/50 bg-blue-500/15 text-blue-400"
            : "border-subtle bg-surface2/80 text-muted"
        }`}
      >
        CVD {formatDelta(displayDelta)}
      </div>

      {/* Previous-day badge */}
      {isPreviousDay && (
        <div className="absolute top-10 left-3 z-20 pointer-events-none rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur-md">
          PREV DAY{candleDate ? ` — ${candleDate}` : ""}
        </div>
      )}

      {/* TradingView Long & Short Position Tool Overlay Boxes */}
      {positionCoords && (
        <svg
          className="absolute inset-0 pointer-events-none z-10 w-full h-full"
          style={{ overflow: "hidden" }}
        >
          <defs>
            <linearGradient id="tvProfitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.10" />
            </linearGradient>
            <linearGradient id="tvRiskGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.10" />
            </linearGradient>
            <linearGradient
              id="tvBreakevenGrad"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* 1. Profit Target Zone Box */}
          <rect
            x={positionCoords.x1}
            y={Math.min(positionCoords.yEntry, positionCoords.yTarget)}
            width={positionCoords.width}
            height={Math.max(
              Math.abs(positionCoords.yEntry - positionCoords.yTarget),
              2,
            )}
            fill="url(#tvProfitGrad)"
            stroke="#10b981"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            rx="4"
          />

          {/* 2. Stop Loss / Trailing Risk Zone Box */}
          <rect
            x={positionCoords.x1}
            y={Math.min(positionCoords.yEntry, positionCoords.ySl)}
            width={positionCoords.width}
            height={Math.max(
              Math.abs(positionCoords.yEntry - positionCoords.ySl),
              2,
            )}
            fill={
              positionCoords.isBreakeven
                ? "url(#tvBreakevenGrad)"
                : "url(#tvRiskGrad)"
            }
            stroke={positionCoords.isBreakeven ? "#10b981" : "#ef4444"}
            strokeWidth="1.5"
            strokeDasharray="4 2"
            rx="4"
          />

          {/* 3. Center Entry Line */}
          <line
            x1={positionCoords.x1}
            y1={positionCoords.yEntry}
            x2={positionCoords.x2}
            y2={positionCoords.yEntry}
            stroke="#3b82f6"
            strokeWidth="2"
            strokeDasharray="6 3"
          />

          {/* 4. Target Label Badge */}
          <g
            transform={`translate(${positionCoords.x1 + 8}, ${Math.min(positionCoords.yEntry, positionCoords.yTarget) + 15})`}
          >
            <rect
              x="-4"
              y="-11"
              width="165"
              height="18"
              rx="4"
              fill="rgba(6, 78, 59, 0.9)"
              stroke="#10b981"
              strokeWidth="1"
            />
            <text
              x="4"
              y="2"
              fill="#34d399"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              🎯 Target: ₹{positionCoords.target.toFixed(2)} (+
              {positionCoords.rrRatio}R)
            </text>
          </g>

          {/* 5. Entry Label Badge */}
          <g
            transform={`translate(${positionCoords.x1 + 8}, ${positionCoords.yEntry - 5})`}
          >
            <rect
              x="-4"
              y="-11"
              width="155"
              height="18"
              rx="4"
              fill="rgba(30, 58, 138, 0.92)"
              stroke="#3b82f6"
              strokeWidth="1"
            />
            <text
              x="4"
              y="2"
              fill="#93c5fd"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {positionCoords.isBuy ? "▲ LONG" : "▼ SHORT"}{" "}
              {positionCoords.quantity} Qty @ ₹{positionCoords.entry.toFixed(2)}
            </text>
          </g>

          {/* 6. Stop Loss / TSL Label Badge */}
          <g
            transform={`translate(${positionCoords.x1 + 8}, ${Math.max(positionCoords.yEntry, positionCoords.ySl) - 5})`}
          >
            <rect
              x="-4"
              y="-11"
              width="170"
              height="18"
              rx="4"
              fill={
                positionCoords.isBreakeven
                  ? "rgba(6, 78, 59, 0.9)"
                  : "rgba(127, 29, 29, 0.9)"
              }
              stroke={positionCoords.isBreakeven ? "#10b981" : "#ef4444"}
              strokeWidth="1"
            />
            <text
              x="4"
              y="2"
              fill={positionCoords.isBreakeven ? "#34d399" : "#fca5a5"}
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {positionCoords.isBreakeven
                ? "🛡️ BE Stop"
                : positionCoords.tslActive
                  ? "⚡ Trailing SL"
                  : "🛑 Stop Loss"}
              : ₹{positionCoords.sl.toFixed(2)}
            </text>
          </g>
        </svg>
      )}

      {/* Chart Canvas */}
      <div ref={containerRef} style={{ height }} className="w-full" />
    </div>
  );
}
