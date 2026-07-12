import React, { useEffect, useRef } from "react";

/**
 * Canvas-rendered dual-range bar. Coordinates arrive pre-normalized (0-100%)
 * from the backend mapper; we only rasterize. Canvas keeps 40+ of these cheap
 * to repaint every second without React reconciling per-pixel DOM nodes.
 */
const OverlappingRangeBar = React.memo(({ ranges }) => {
  const canvasRef = useRef(null);
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

    const pct = (v) => (Math.max(0, Math.min(100, v)) / 100) * W;

    // Previous day range (grey)
    const pL = pct(ranges.yesterday.low);
    const pR = pct(ranges.yesterday.high);
    ctx.fillStyle = "#374151";
    roundRect(ctx, pL, H / 2 - 2, Math.max(2, pR - pL), 4, 2);

    // Today's range (blue)
    const tL = pct(ranges.today.low);
    const tR = pct(ranges.today.high);
    ctx.fillStyle = "#3b82f6";
    roundRect(ctx, tL, H / 2 - 4, Math.max(2, tR - tL), 8, 3);

    // LTP marker (white tick)
    const tick = pct(ranges.ltp_pos);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tick, 1);
    ctx.lineTo(tick, H - 1);
    ctx.stroke();
  }, [ranges]);

  return <canvas ref={canvasRef} style={{ width: `${W}px`, height: `${H}px` }} />;
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
