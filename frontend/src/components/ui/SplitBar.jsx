import React from "react";
import { motion } from "framer-motion";

// Animated segmented horizontal bar shared by MarketBreadth / BuySellPressure.
export default function SplitBar({ segments }) {
  return (
    <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-surface3">
      {segments.map(
        (seg, i) =>
          seg.pct > 0 && (
            <motion.div
              key={i}
              initial={{ width: 0 }}
              animate={{ width: `${seg.pct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className={seg.className}
            />
          ),
      )}
    </div>
  );
}
