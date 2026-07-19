// Mirrors backend/app/config.py's MARKET_OPEN (09:15) / MARKET_CLOSE (15:30) —
// used purely to label the 15-min candle marks in the UI, no live data needed.
const OPEN_MIN = 9 * 60 + 15;
const CLOSE_MIN = 15 * 60 + 30;
const STEP_MIN = 15;

function fmt(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// [{ candle: 1, minutes: 555, label: "09:15" }, { candle: 2, minutes: 570, label: "09:30" }, ...]
export const CANDLE_MARKS = (() => {
  const marks = [];
  let candle = 1;
  for (let m = OPEN_MIN; m <= CLOSE_MIN; m += STEP_MIN, candle++) {
    marks.push({ candle, minutes: m, label: fmt(m) });
  }
  return marks;
})();

export function timeStrToMinutes(hhmm) {
  if (!hhmm) return null;
  const parts = hhmm.split(":").map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]))
    return null;
  return parts[0] * 60 + parts[1];
}
