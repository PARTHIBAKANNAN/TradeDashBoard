import React, { useState, useMemo } from "react";
import {
  History,
  PieChart,
  FileBarChart,
  LayoutDashboard,
  Flame,
  Lightbulb,
  ArrowLeft,
  Filter,
  BarChart2,
} from "lucide-react";
import {
  useOrderHistory,
  usePaperTradingSync,
  fetchHistory,
} from "../hooks/useOrders.js";
import DateRangeFilter, {
  formatRangeLabel,
} from "../components/paper-trading/DateRangeFilter.jsx";
import OrderHistoryTable from "../components/paper-trading/OrderHistoryTable.jsx";
import TradesAnalyticsCard from "../components/paper-trading/TradesAnalyticsCard.jsx";
import ChargesSummaryCard from "../components/paper-trading/ChargesSummaryCard.jsx";
import ExportButtons from "../components/paper-trading/ExportButtons.jsx";
import EquityCurveChart from "../components/paper-trading/EquityCurveChart.jsx";
import Insights from "../components/insights/Insights.jsx";
import Treemap from "../components/Treemap.jsx";
import Card from "../components/ui/Card.jsx";

const HISTORY_EXPORT_LIMIT = 1000;

const SECTIONS = [
  { key: "overview", label: "Executive Performance Deck", icon: PieChart },
  { key: "market", label: "Market & Sector Heatmaps", icon: Flame },
  { key: "history", label: "Order History & Journal", icon: History },
  { key: "reports", label: "P&L & Tax Reports", icon: FileBarChart },
];

export default function DashboardScreen({ stocks, initialSubTab = "overview" }) {
  usePaperTradingSync();
  const history = useOrderHistory();

  // Normalize initial tab
  const [activeTab, setActiveTab] = useState(() => {
    if (initialSubTab === "heatmap" || initialSubTab === "insights") {
      return "market";
    }
    return initialSubTab || "overview";
  });

  const [marketSubView, setMarketSubView] = useState(() => {
    return initialSubTab === "insights" ? "insights" : "treemap";
  });

  const [range, setRange] = useState({ key: "allTime", from: null, to: null });
  const [drilldownSector, setDrilldownSector] = useState(null);

  const onRangeChange = (key, { from, to }) => {
    setRange({ key, from, to });
    fetchHistory({ from, to, limit: HISTORY_EXPORT_LIMIT }).catch(() => {});
  };

  // Filter history orders strictly by selected range
  const filteredOrders = useMemo(() => {
    if (!range.from && !range.to) return history;
    const fromTime = range.from ? new Date(range.from).getTime() : -Infinity;
    const toTime = range.to ? new Date(range.to).getTime() : Infinity;
    return history.filter((o) => {
      const placed = o.placed_at ? new Date(o.placed_at).getTime() : 0;
      const closed = o.closed_at ? new Date(o.closed_at).getTime() : 0;
      const created = o.created_at ? new Date(o.created_at).getTime() : 0;
      const t = closed || placed || created;
      return t >= fromTime && t <= toTime;
    });
  }, [history, range]);

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-[1920px] w-full px-3 sm:px-6 py-4 space-y-4">
        {/* Header with 4 Clear Top Sections */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-subtle">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-sm">
              <LayoutDashboard size={16} />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-primary font-display flex items-center gap-2">
                <span>Trading Intelligence &amp; Analytics</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface3 text-muted border border-subtle font-semibold">
                  {filteredOrders.length} {filteredOrders.length === 1 ? "trade" : "trades"}
                </span>
              </h2>
              <p className="text-[11px] text-faint">
                Executive performance metrics, market heatmaps, order logs, and tax ledger
              </p>
            </div>
          </div>

          {/* Top 4 First-Class Segmented Views */}
          <div className="flex items-center gap-1 bg-surface3/60 p-1 rounded-xl border border-subtle shadow-inner flex-wrap">
            {SECTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === key
                    ? "bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm font-bold"
                    : "text-muted hover:text-primary hover:bg-surface2"
                }`}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* SECTION 1: Executive Performance Deck */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
            <TradesAnalyticsCard orders={filteredOrders} stocks={stocks} />
            <EquityCurveChart closedOrders={filteredOrders} />
          </div>
        )}

        {/* SECTION 2: Market & Sector Heatmaps */}
        {activeTab === "market" && (
          <div className="space-y-4">
            {/* Sub-view toggle between Sector Treemap and Market Insights */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-subtle">
              <div className="flex items-center gap-1.5 bg-surface3/60 p-1 rounded-lg border border-subtle">
                <button
                  onClick={() => setMarketSubView("treemap")}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                    marketSubView === "treemap"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-muted hover:text-primary"
                  }`}
                >
                  <Flame size={13} />
                  <span>Sector Treemap</span>
                </button>
                <button
                  onClick={() => setMarketSubView("insights")}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                    marketSubView === "insights"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-muted hover:text-primary"
                  }`}
                >
                  <Lightbulb size={13} />
                  <span>Market Breadth &amp; Signals</span>
                </button>
              </div>

              {marketSubView === "treemap" && drilldownSector && (
                <button
                  onClick={() => setDrilldownSector(null)}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface3 border border-subtle cursor-pointer"
                >
                  <ArrowLeft size={13} /> Back to All Sectors
                </button>
              )}
            </div>

            {marketSubView === "treemap" ? (
              <Card bodyClassName="p-2">
                <Treemap
                  stocks={stocks}
                  drilldownSector={drilldownSector}
                  onSelectSector={setDrilldownSector}
                />
              </Card>
            ) : (
              <Insights stocks={stocks} />
            )}
          </div>
        )}

        {/* SECTION 3: Order History & Trade Journal */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
            <OrderHistoryTable orders={filteredOrders} />
          </div>
        )}

        {/* SECTION 4: P&L & Tax Reports */}
        {activeTab === "reports" && (
          <div className="space-y-4">
            <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
            <ChargesSummaryCard
              orders={filteredOrders}
              rangeLabel={formatRangeLabel(range.from, range.to)}
            />
            <ExportButtons orders={filteredOrders} range={range} />
          </div>
        )}
      </div>
    </div>
  );
}
