import React, { useMemo, useState } from "react";
import WatchlistRow from "../components/WatchlistRow.jsx";

const SORTS = {
  rs_desc: { label: "RS ▼ (strongest)", fn: (a, b) => b.relative_strength - a.relative_strength },
  rs_asc: { label: "RS ▲ (weakest)", fn: (a, b) => a.relative_strength - b.relative_strength },
  chg_desc: { label: "% Change ▼", fn: (a, b) => b.pct_change - a.pct_change },
  pos_desc: { label: "Day range % ▼", fn: (a, b) => b.day_range_pos - a.day_range_pos },
  sym: { label: "Symbol A-Z", fn: (a, b) => a.symbol.localeCompare(b.symbol) },
};

export default function RankingScreen({ stocks }) {
  const [showFilters, setShowFilters] = useState(true);
  const [selectedSignal, setSelectedSignal] = useState("All signals");
  const [selectedSector, setSelectedSector] = useState("All sectors");
  const [dayRangeThreshold, setDayRangeThreshold] = useState(0);
  const [sortKey, setSortKey] = useState("rs_desc");

  const sectors = useMemo(() => {
    const set = new Set((stocks || []).map((s) => s.sector));
    return ["All sectors", ...Array.from(set).sort()];
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    const rows = (stocks || []).filter((stock) => {
      if (selectedSignal !== "All signals") {
        if (!stock.signal || !stock.signal.includes(selectedSignal)) return false;
      }
      if (selectedSector !== "All sectors" && stock.sector !== selectedSector) return false;
      if (stock.day_range_pos < dayRangeThreshold) return false;
      return true;
    });
    return rows.sort(SORTS[sortKey].fn);
  }, [stocks, selectedSignal, selectedSector, dayRangeThreshold, sortKey]);

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-6 flex gap-6">
        {/* Filters Sidebar */}
        {showFilters && (
          <div className="w-64 flex-shrink-0">
            <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg p-4 sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-primary">Filters</h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="text-muted hover:text-primary transition-colors text-lg"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <FilterGroup label="Breakout Signal">
                  <select
                    value={selectedSignal}
                    onChange={(e) => setSelectedSignal(e.target.value)}
                    className="w-full bg-surface3 border border-strong rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent-blue"
                  >
                    <option>All signals</option>
                    <option value="Bull">Bull</option>
                    <option value="Bear">Bear</option>
                  </select>
                </FilterGroup>

                <FilterGroup label="Sector">
                  <select
                    value={selectedSector}
                    onChange={(e) => setSelectedSector(e.target.value)}
                    className="w-full bg-surface3 border border-strong rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent-blue"
                  >
                    {sectors.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </FilterGroup>

                <FilterGroup label="Sort by">
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    className="w-full bg-surface3 border border-strong rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent-blue"
                  >
                    {Object.entries(SORTS).map(([key, { label }]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FilterGroup>

                <FilterGroup label={`Day Range Position ≥ ${dayRangeThreshold}%`}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={dayRangeThreshold}
                    onChange={(e) => setDayRangeThreshold(Number(e.target.value))}
                    className="w-full h-2 bg-surface3 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="text-xs text-faint mt-2 text-center">{dayRangeThreshold}%</div>
                </FilterGroup>

                <button
                  onClick={() => {
                    setSelectedSignal("All signals");
                    setSelectedSector("All sectors");
                    setDayRangeThreshold(0);
                    setSortKey("rs_desc");
                  }}
                  className="w-full text-xs font-bold text-accent-blue hover:text-accent-violet transition-colors py-2 border border-subtle rounded hover:bg-surface3"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            {!showFilters && (
              <button
                onClick={() => setShowFilters(true)}
                className="text-xs font-bold text-accent-blue hover:text-accent-violet transition-colors flex items-center gap-2"
              >
                ⚙ Show Filters
              </button>
            )}
            <div className="text-xs text-faint ml-auto">
              Showing <span className="font-bold text-primary">{filteredStocks.length}</span> stocks
            </div>
          </div>

          {/* Table */}
          <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface3/50 border-b border-subtle">
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider">Stock</th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">LTP</th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">Price Range</th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">Signal</th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">RS vs NIFTY</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.map((stock) => (
                    <WatchlistRow key={stock.symbol} stock={stock} />
                  ))}
                </tbody>
              </table>
            </div>
            {filteredStocks.length === 0 && (
              <div className="py-12 text-center text-faint text-sm">
                No stocks match the current filters. Try adjusting your criteria.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted uppercase mb-2">{label}</label>
      {children}
    </div>
  );
}
