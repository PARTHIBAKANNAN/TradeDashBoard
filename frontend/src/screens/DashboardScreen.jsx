import React, { useState } from "react";
import {
  History,
  PieChart,
  FileBarChart,
  LayoutDashboard,
  Flame,
  Lightbulb,
  ArrowLeft,
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

const TABS = [
  { key: "overview", label: "Performance Overview", icon: PieChart },
  { key: "insights", label: "Market Insights", icon: Lightbulb },
  { key: "heatmap", label: "Sector Heatmap", icon: Flame },
  { key: "history", label: "Order History", icon: History },
  { key: "reports", label: "P&L & Tax Reports", icon: FileBarChart },
];

export default function DashboardScreen({ stocks, initialSubTab = "overview" }) {
  usePaperTradingSync();
  const history = useOrderHistory();
  const [activeTab, setActiveTab] = useState(initialSubTab);
  const [range, setRange] = useState({ key: null, from: null, to: null });
  const [drilldownSector, setDrilldownSector] = useState(null);

  const onRangeChange = (key, { from, to }) => {
    setRange({ key, from, to });
    fetchHistory({ from, to, limit: HISTORY_EXPORT_LIMIT }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-[1920px] w-full px-3 sm:px-6 py-4 space-y-4">
        {/* Header with Subtabs */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-subtle">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-sm">
              <LayoutDashboard size={16} />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-primary font-display">
                Trading Intelligence &amp; Analytics
              </h2>
              <p className="text-[11px] text-faint">
                Comprehensive performance logs, market insights, sector heatmaps, and tax reports
              </p>
            </div>
          </div>

          {/* Subtabs bar */}
          <div className="flex items-center gap-1 bg-[#10141e]/80 p-1 rounded-xl border border-white/5 shadow-inner flex-wrap">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === key
                    ? "bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm font-bold"
                    : "text-muted hover:text-primary hover:bg-white/5"
                }`}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab 1: Performance Overview */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
            <TradesAnalyticsCard orders={history} stocks={stocks} />
            <EquityCurveChart closedOrders={history} />
          </div>
        )}

        {/* Tab 2: Market Insights */}
        {activeTab === "insights" && (
          <div className="space-y-4">
            <Insights stocks={stocks} />
          </div>
        )}

        {/* Tab 3: Sector Heatmap */}
        {activeTab === "heatmap" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-primary">
                  {drilldownSector ? `Sector: ${drilldownSector}` : "Market Sector Treemap (210 Stocks)"}
                </h3>
                <p className="text-xs text-faint">
                  Tile size represents total traded turnover; tile color represents % change.
                </p>
              </div>
              {drilldownSector && (
                <button
                  onClick={() => setDrilldownSector(null)}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface3 border border-subtle"
                >
                  <ArrowLeft size={13} /> Back to All Sectors
                </button>
              )}
            </div>
            <Card bodyClassName="p-2">
              <Treemap
                stocks={stocks}
                drilldownSector={drilldownSector}
                onSelectSector={setDrilldownSector}
              />
            </Card>
          </div>
        )}

        {/* Tab 4: Order History & Journal */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
            <OrderHistoryTable orders={history} />
          </div>
        )}

        {/* Tab 5: P&L & Tax Reports */}
        {activeTab === "reports" && (
          <div className="space-y-4">
            <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
            <ChargesSummaryCard
              orders={history}
              rangeLabel={formatRangeLabel(range.from, range.to)}
            />
            <ExportButtons orders={history} range={range} />
          </div>
        )}
      </div>
    </div>
  );
}

