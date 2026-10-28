import React, { useMemo, useState } from "react";
import {
  Rocket,
  LineChart,
  History,
  FileBarChart,
  PieChart,
} from "lucide-react";
import Card from "../ui/Card.jsx";
import {
  usePositions,
  useOrderHistory,
  usePnlSummary,
  usePaperTradingSync,
  fetchHistory,
} from "../../hooks/useOrders.js";
import WalletSummaryCard from "./WalletSummaryCard.jsx";
import PlaceOrderForm from "./PlaceOrderForm.jsx";
import PositionsTable from "./PositionsTable.jsx";
import OrderHistoryTable from "./OrderHistoryTable.jsx";
import EquityCurveChart from "./EquityCurveChart.jsx";
import DateRangeFilter, { formatRangeLabel } from "./DateRangeFilter.jsx";
import ChargesSummaryCard from "./ChargesSummaryCard.jsx";
import ExportButtons from "./ExportButtons.jsx";
import TradesAnalyticsCard from "./TradesAnalyticsCard.jsx";

// A generous cap rather than true pagination — this is a personal paper-
// trading log, not expected to run into thousands of rows in one range.
const HISTORY_EXPORT_LIMIT = 1000;

const SUB_TABS = [
  { key: "trade", label: "Trade", icon: LineChart },
  { key: "history", label: "History", icon: History },
  { key: "analytics", label: "Analytics", icon: PieChart },
  { key: "reports", label: "Reports", icon: FileBarChart },
];

export default function PaperTrading({ stocks }) {
  usePaperTradingSync();
  const positions = usePositions();
  const history = useOrderHistory();
  const summary = usePnlSummary();
  const [range, setRange] = useState({ key: null, from: null, to: null });
  const [subTab, setSubTab] = useState("trade");

  const marginInUse = useMemo(
    () => positions.reduce((sum, o) => sum + (Number(o.margin_locked) || 0), 0),
    [positions],
  );

  const onRangeChange = (key, { from, to }) => {
    setRange({ key, from, to });
    fetchHistory({ from, to, limit: HISTORY_EXPORT_LIMIT }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      {/* Visible across every sub-tab so balance/P&L stays in view regardless
          of which one is active. */}
      <WalletSummaryCard summary={summary} marginInUse={marginInUse} />

      <div className="grid grid-cols-4 sm:flex gap-1 overflow-x-auto no-scrollbar border-b border-subtle">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex items-center justify-center gap-1.5 px-2 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors border-b-2 ${
              subTab === key
                ? "border-accent-blue text-accent-blue"
                : "border-transparent text-muted hover:text-primary"
            }`}
          >
            <Icon size={13} className="flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {subTab === "trade" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Place Order" icon={Rocket} className="lg:col-span-1">
              <PlaceOrderForm stocks={stocks} />
            </Card>
            <div className="lg:col-span-2">
              <PositionsTable positions={positions} summary={summary} marginInUse={marginInUse} />
            </div>
          </div>
        </div>
      )}

      {subTab === "history" && (
        <div className="space-y-4">
          <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
          <OrderHistoryTable orders={history} />
        </div>
      )}

      {subTab === "analytics" && (
        <div className="space-y-4">
          <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
          <TradesAnalyticsCard orders={history} stocks={stocks} />
        </div>
      )}

      {subTab === "reports" && (
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
  );
}
