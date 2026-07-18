import React, { useState } from "react";
import Treemap from "../components/Treemap.jsx";

export default function HeatmapScreen({ stocks }) {
  const [drilldownSector, setDrilldownSector] = useState(null);

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-full px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-primary mb-2">
                Market Heatmap
              </h2>
              <p className="text-xs text-faint">
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
                      · size = total traded value · color = sector avg % change
                    </span>
                  </>
                )}
              </p>
            </div>
            {drilldownSector && (
              <button
                onClick={() => setDrilldownSector(null)}
                className="text-sm font-bold text-accent-blue hover:text-accent-violet transition-colors flex items-center gap-2 px-4 py-2 rounded hover:bg-surface3"
              >
                ← Back to All Sectors
              </button>
            )}
          </div>
        </div>

        {/* Treemap */}
        <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg p-6">
          <Treemap
            stocks={stocks}
            drilldownSector={drilldownSector}
            onSelectSector={setDrilldownSector}
          />
        </div>

        {/* Legend */}
        <div className="mt-6 bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg p-4">
          <h3 className="text-sm font-bold text-primary mb-3">
            How to read this
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="inline-block w-3 h-3 rounded mr-2 bg-green-500"></span>
              <span className="text-muted">
                Positive change (green) indicates bullish momentum
              </span>
            </div>
            <div>
              <span className="inline-block w-3 h-3 rounded mr-2 bg-red-500"></span>
              <span className="text-muted">
                Negative change (red) indicates bearish momentum
              </span>
            </div>
            <div>
              <span className="inline-block w-3 h-3 rounded mr-2 bg-gray-500"></span>
              <span className="text-muted">
                Larger tiles = higher trading volume and value
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
