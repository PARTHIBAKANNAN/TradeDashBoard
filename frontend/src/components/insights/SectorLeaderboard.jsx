import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Building2 } from "lucide-react";
import { sectorAggregates } from "../../utils/sectorAggregates.js";
import Card from "../ui/Card.jsx";

// Horizontal bar chart ranking each NIFTY group by SIMPLE mean %change
// (deliberately not traded-value-weighted — see sectorAggregates.js).
export default function SectorLeaderboard({ stocks }) {
  const ranked = useMemo(() => {
    return sectorAggregates(stocks).sort((a, b) => b.mean - a.mean);
  }, [stocks]);

  const maxAbs = Math.max(1, ...ranked.map((r) => Math.abs(r.mean)));

  return (
    <Card title="Sector Performance" icon={Building2} className="h-full">
      <div className="space-y-1.5">
        {ranked.map((r) => {
          const isUp = r.mean >= 0;
          const widthPct = (Math.abs(r.mean) / maxAbs) * 100;
          return (
            <div key={r.group} className="flex items-center gap-2 text-xs">
              <span className="w-32 truncate text-muted font-medium">
                {r.group}
              </span>
              <div className="flex-1 h-4 bg-surface3 rounded-sm relative overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${widthPct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className={`h-full ${isUp ? "bg-bull/70" : "bg-bear/70"}`}
                  style={{ marginLeft: isUp ? "0" : "auto" }}
                />
              </div>
              <span
                className={`w-14 text-right font-mono font-bold tabular-nums ${
                  isUp ? "text-bull" : "text-bear"
                }`}
              >
                {isUp ? "+" : ""}
                {r.mean}%
              </span>
            </div>
          );
        })}
        {ranked.length === 0 && (
          <p className="text-xs text-faint">No data yet.</p>
        )}
      </div>
    </Card>
  );
}
