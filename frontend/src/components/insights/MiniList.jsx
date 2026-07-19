import React from "react";
import Card from "../ui/Card.jsx";

// Shared ranked-list card used by NewHighsLows and RankedMovers — a title,
// an optional icon, and rows of { symbol, value, valueClass, rank }.
export default function MiniList({
  title,
  icon,
  rows,
  renderValue,
  showRank = false,
}) {
  return (
    <Card title={title} icon={icon} className="h-full">
      <div className="space-y-1">
        {rows.map((s, i) => (
          <div
            key={s.symbol}
            className="flex items-center justify-between text-xs py-1"
          >
            <div className="flex items-center gap-2 min-w-0">
              {showRank && (
                <span className="text-faint font-mono w-4">{i + 1}</span>
              )}
              <span className="font-bold text-primary truncate">
                {s.symbol}
              </span>
            </div>
            <span className="font-mono font-bold whitespace-nowrap tabular-nums">
              {renderValue(s)}
            </span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-faint">No data yet.</p>}
      </div>
    </Card>
  );
}
