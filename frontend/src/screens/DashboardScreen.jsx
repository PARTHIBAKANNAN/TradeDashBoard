import React, { useState } from "react";
import { History, PieChart, FileBarChart, LayoutDashboard } from "lucide-react";
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

const HISTORY_EXPORT_LIMIT = 1000;

const TABS = [
  { key: "history", label: "Order History", icon: History },
  { key: "analytics", label: "Performance Analytics", icon: PieChart },
  { key: "reports", label: "P&L & Tax Reports", icon: FileBarChart },
];

export default function DashboardScreen({ stocks }) {
  usePaperTradingSync();
  const history = useOrderHistory();
  const [activeTab, setActiveTab] = useState("history");
  const [range, setRange] = useState({ key: null, from: null, to: null });

  const onRangeChange = (key, { from, to }) => {
    setRange({ key, from, to });
    fetchHistory({ from, to, limit: HISTORY_EXPORT_LIMIT }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-[1920px] w-full px-3 sm:px-6 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent-blue/15 text-accent-blue border border-accent-blue/30 shadow-sm">
              <LayoutDashboard size={18} />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-primary font-display">
                Trading Journal &amp; Analytics
              </h2>
              <p className="text-xs text-faint">
                Post-market trade reviews, equity curves, win-rate metrics, and fee reports
              </p>
            </div>
          </div>

          {/* Subtabs bar */}
          <div className="flex items-center gap-1 bg-surface2/80 p-1 rounded-xl border border-subtle">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === key
                    ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/40 shadow-sm"
                    : "text-muted hover:text-primary hover:bg-surface3/60"
                }`}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
            <OrderHistoryTable orders={history} />
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-4">
            <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
            <TradesAnalyticsCard orders={history} stocks={stocks} />
          </div>
        )}

        {activeTab === "reports" && (
          <div className="space-y-4">
            <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
            <ChargesSummaryCard
              orders={history}
              rangeLabel={formatRangeLabel(range.from, range.to)}
            />
            <ExportButtons orders={history} range={range} />
            <EquityCurveChart closedOrders={history} />
          </div>
        )}
      </div>
    </div>
  );
}
