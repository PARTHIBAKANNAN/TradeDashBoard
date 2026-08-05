// Date-range presets for the paper-trading history/export section. Every
// preset resolves to concrete Date objects here on the frontend — the
// backend only ever sees plain from/to timestamps (see useOrders.js), so
// "start of week"/timezone semantics live in exactly one place.

function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Monday-start week (ISO-style), matching how NSE trading weeks are usually discussed.
function mondayOf(d) {
  const r = startOfDay(d);
  const day = r.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(r, diff);
}

export function today() {
  const now = new Date();
  return { from: startOfDay(now), to: now };
}

export function yesterday() {
  const y = addDays(new Date(), -1);
  return { from: startOfDay(y), to: endOfDay(y) };
}

export function thisWeek() {
  const now = new Date();
  return { from: mondayOf(now), to: now };
}

export function lastWeek() {
  const now = new Date();
  const thisMonday = mondayOf(now);
  return {
    from: addDays(thisMonday, -7),
    to: endOfDay(addDays(thisMonday, -1)),
  };
}

export function thisMonth() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    to: now,
  };
}

// Trailing N-day window INCLUDING today (so lastNDays(30) spans 30 calendar
// days total: today plus the 29 before it).
export function lastNDays(n) {
  const now = new Date();
  return { from: startOfDay(addDays(now, -(n - 1))), to: now };
}

export const PRESETS = [
  { key: "today", label: "Today", range: today },
  { key: "yesterday", label: "Yesterday", range: yesterday },
  { key: "thisWeek", label: "This Week", range: thisWeek },
  { key: "lastWeek", label: "Last Week", range: lastWeek },
  { key: "thisMonth", label: "This Month", range: thisMonth },
  { key: "last30", label: "Last 30 Days", range: () => lastNDays(30) },
  { key: "last60", label: "Last 60 Days", range: () => lastNDays(60) },
];
