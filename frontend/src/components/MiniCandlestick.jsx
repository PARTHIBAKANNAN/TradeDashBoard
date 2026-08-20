import React, { useEffect, useRef } from "react";
import { useTheme } from "../contexts/ThemeContext.jsx";

// 5-min candles across a 09:15-15:30 trading day = 75 slots. Fixed slot count
// (not "however many candles exist so far") so the chart's width/density stays
// constant through the day instead of visually stretching as candles arrive.
const TOTAL_SLOTS = 75;
const W = 200;
const H = 36;

/**
 * Canvas-rendered mini candlestick chart — replaces the previous dual-range
 * bar. `candles` (built live in useMarketStream.js from streamed LTPs, not
 * from the broker's historical-data REST endpoint) is an array of
 * {bucket, open, high, low, close}, oldest first.
 */
const MiniCandlestick = React.memo(({ candles }) => {
  const canvasRef = useRef(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (!candles || candles.length === 0) return;

    const styles = getComputedStyle(document.documentElement);
    const getRgb = (prop, fallback) => {
      const raw = (styles.getPropertyValue(prop) || "").trim();
      if (!raw) return fallback;
      if (raw.startsWith("#") || raw.startsWith("rgb")) return raw;
      const formatted = raw.replace(/\s+/g, ", ");
      return `rgb(${formatted})`;
    };
    const upColor = getRgb("--bull-strong", "rgb(16, 185, 129)");
    const downColor = getRgb("--bear-strong", "rgb(244, 63, 94)");

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const span = max - min || max * 0.01 || 1; // flat-price guard

    const FIRST_BUCKET_MIN = 555; // 09:15 in minutes = 9 * 60 + 15
    const isChronological = candles.some(
      (c) => c.bucket != null && c.bucket >= FIRST_BUCKET_MIN,
    );
    const slotW = W / TOTAL_SLOTS;
    const bodyW = Math.max(1.8, slotW * 0.72);
    const y = (price) => H - 2 - ((price - min) / span) * (H - 4);

    candles.forEach((c, i) => {
      let slotIndex = i;
      if (isChronological && c.bucket != null && c.bucket >= FIRST_BUCKET_MIN) {
        slotIndex = Math.min(
          TOTAL_SLOTS - 1,
          Math.max(0, Math.floor((c.bucket - FIRST_BUCKET_MIN) / 5)),
        );
      }
      const x = slotIndex * slotW + slotW / 2;
      const isUp = c.close >= c.open;
      const color = isUp ? upColor : downColor;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y(c.high));
      ctx.lineTo(x, y(c.low));
      ctx.stroke();

      ctx.fillStyle = color;
      const yOpen = y(c.open);
      const yClose = y(c.close);
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
      ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyHeight);
    });
  }, [candles, theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${W}px`, height: `${H}px` }}
      title={
        candles?.length
          ? `${candles.length} x 5-min candles today`
          : "No candles yet"
      }
    />
  );
});

export default MiniCandlestick;
