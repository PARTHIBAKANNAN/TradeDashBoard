// Pure JS mirror of backend/app/calculations.py::range_map.
// Kept in sync with the Python version by shared unit tests
// (backend/tests/test_calculations.py + src/lib/rangeMap.test.js).

const round2 = (n) => Math.round(n * 100) / 100;

function normalize(price, gMin, gMax) {
  const denom = (gMax - gMin) || 1.0;
  return round2(((price - gMin) / denom) * 100);
}

export function rangeMap(yLow, yHigh, tLow, tHigh, ltp) {
  const gMin = Math.min(yLow, tLow);
  const gMax = Math.max(yHigh, tHigh);
  return {
    yesterday: {
      low: normalize(yLow, gMin, gMax),
      high: normalize(yHigh, gMin, gMax),
      raw_low: yLow,
      raw_high: yHigh,
    },
    today: {
      low: normalize(tLow, gMin, gMax),
      high: normalize(tHigh, gMin, gMax),
      raw_low: tLow,
      raw_high: tHigh,
    },
    ltp_pos: normalize(ltp, gMin, gMax),
  };
}
