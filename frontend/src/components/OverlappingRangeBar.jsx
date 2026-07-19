import React, { useEffect, useRef } from "react";
import { useTheme } from "../contexts/ThemeContext.jsx";

/**
 * Canvas-rendered dual-range bar. Coordinates arrive pre-normalized (0-100%)
 * from the backend mapper; we only rasterize. Canvas keeps 40+ of these cheap
 * to repaint every second without React reconciling per-pixel DOM nodes.
 */
const OverlappingRangeBar = React.memo(({ ranges }) => {
  const canvasRef = useRef(null);
  const { theme } = useTheme();
  const W = 160;
  const H = 14;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ranges) return;
    const ctx = canvas.getContext("2d");

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // reset+scale (avoids compounding)
    ctx.clearRect(0, 0, W, H);

    // Canvas can't use CSS dark:/light classes — read the theme-aware color
    // strings directly from the CSS custom properties defined in index.css.
    // (These are full color strings, e.g. "#ffffff", not the channel-triplet
    // tokens Tailwind uses, since Canvas needs a value it can assign as-is.)
    const styles = getComputedStyle(document.documentElement);
    const prevRangeColor =
      styles.getPropertyValue("--canvas-prev-range").trim() || "#3a3f52";
    const todayA =
      styles.getPropertyValue("--canvas-today-range-a").trim() || "#60a5fa";
    const todayB =
      styles.getPropertyValue("--canvas-today-range-b").trim() || "#a78bfa";
    const ltpTickColor =
      styles.getPropertyValue("--canvas-ltp-tick").trim() || "#f4f6fb";
    const ltpGlow =
      styles.getPropertyValue("--canvas-ltp-glow").trim() ||
      "rgba(167,139,250,0.55)";

    const pct = (v) => (Math.max(0, Math.min(100, v)) / 100) * W;

    // Track baseline
    ctx.fillStyle = "rgba(127,127,127,0.08)";
    roundRect(ctx, 0, H / 2 - 2, W, 4, 2);

    // Previous day range
    const pL = pct(ranges.yesterday.low);
    const pR = pct(ranges.yesterday.high);
    ctx.fillStyle = prevRangeColor;
    roundRect(ctx, pL, H / 2 - 2, Math.max(2, pR - pL), 4, 2);

    // Today's range — gradient fill, blue -> violet
    const tL = pct(ranges.today.low);
    const tR = pct(ranges.today.high);
    const grad = ctx.createLinearGradient(tL, 0, Math.max(tL + 1, tR), 0);
    grad.addColorStop(0, todayA);
    grad.addColorStop(1, todayB);
    ctx.fillStyle = grad;
    roundRect(ctx, tL, H / 2 - 4, Math.max(2, tR - tL), 8, 3);

    // LTP marker tick, with a soft glow behind it
    const tick = pct(ranges.ltp_pos);
    ctx.save();
    ctx.shadowColor = ltpGlow;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = ltpTickColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tick, 0.5);
    ctx.lineTo(tick, H - 0.5);
    ctx.stroke();
    ctx.restore();

    // Tiny dot cap on the tick for a more deliberate "marker" feel
    ctx.fillStyle = ltpTickColor;
    ctx.beginPath();
    ctx.arc(tick, H / 2, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }, [ranges, theme]); // theme included: canvas must repaint when the toggle flips

  return (
    <canvas ref={canvasRef} style={{ width: `${W}px`, height: `${H}px` }} />
  );
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h); // fallback for older canvas impls
  }
  ctx.fill();
}

export default OverlappingRangeBar;
