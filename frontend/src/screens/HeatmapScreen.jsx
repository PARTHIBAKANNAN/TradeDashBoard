import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, ArrowLeft } from "lucide-react";
import Treemap from "../components/Treemap.jsx";
import Card from "../components/ui/Card.jsx";

export default function HeatmapScreen({ stocks }) {
  const [drilldownSector, setDrilldownSector] = useState(null);

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-full px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent-amber/10 text-accent-amber border border-accent-amber/20">
              <Flame size={17} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-primary font-display">
                Market Heatmap
              </h2>
              <AnimatePresence mode="wait">
                <motion.p
                  key={drilldownSector || "all"}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="text-xs text-faint"
                >
                  {drilldownSector ? (
                    <>
                      <span className="text-muted font-semibold">
                        {drilldownSector}
                      </span>
                      <span className="text-faint">
                        {" "}
                        stocks · size = traded value · color = % change
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-muted font-semibold">
                        All sectors
                      </span>
                      <span className="text-faint">
                        {" "}
                        · size = total traded value · color = sector avg %
                        change
                      </span>
                    </>
                  )}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
          {drilldownSector && (
            <button
              onClick={() => setDrilldownSector(null)}
              className="text-sm font-bold text-accent-blue hover:text-accent-violet transition-colors flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-surface3 border border-subtle"
            >
              <ArrowLeft size={14} />
              Back to All Sectors
            </button>
          )}
        </div>

        {/* Treemap */}
        <Card bodyClassName="p-2">
          <Treemap
            stocks={stocks}
            drilldownSector={drilldownSector}
            onSelectSector={setDrilldownSector}
          />
        </Card>

        {/* Legend */}
        <Card className="mt-6" title="How to read this">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm bg-bull" />
              <span className="text-muted">
                Positive change (green) indicates bullish momentum
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm bg-bear" />
              <span className="text-muted">
                Negative change (red) indicates bearish momentum
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm bg-faint" />
              <span className="text-muted">
                Larger tiles = higher trading volume and value
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
