import React, { useMemo, useState } from "react";
import { Rocket } from "lucide-react";
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

// A generous cap rather than true pagination — this is a personal paper-
// trading log, not expected to run into thousands of rows in one range.
const HISTORY_EXPORT_LIMIT = 1000;

export default function PaperTrading({ stocks }) {
  usePaperTradingSync();
  const positions = usePositions();
  const history = useOrderHistory();
  const summary = usePnlSummary();
  const [range, setRange] = useState({ key: null, from: null, to: null });

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
      <WalletSummaryCard summary={summary} marginInUse={marginInUse} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Place Order" icon={Rocket} className="lg:col-span-1">
          <PlaceOrderForm stocks={stocks} />
        </Card>
        <div className="lg:col-span-2">
          <EquityCurveChart closedOrders={history} />
        </div>
      </div>

      <PositionsTable positions={positions} />

      <DateRangeFilter activeKey={range.key} onChange={onRangeChange} />
      <ChargesSummaryCard orders={history} rangeLabel={formatRangeLabel(range.from, range.to)} />
      <ExportButtons orders={history} />
      <OrderHistoryTable orders={history} />
    </div>
  );
}
