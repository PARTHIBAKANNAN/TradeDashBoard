import React, { useMemo } from "react";
import { Rocket } from "lucide-react";
import Card from "../ui/Card.jsx";
import {
  usePositions,
  useOrderHistory,
  usePnlSummary,
  usePaperTradingSync,
} from "../../hooks/useOrders.js";
import WalletSummaryCard from "./WalletSummaryCard.jsx";
import PlaceOrderForm from "./PlaceOrderForm.jsx";
import PositionsTable from "./PositionsTable.jsx";
import OrderHistoryTable from "./OrderHistoryTable.jsx";
import EquityCurveChart from "./EquityCurveChart.jsx";

export default function PaperTrading({ stocks }) {
  usePaperTradingSync();
  const positions = usePositions();
  const history = useOrderHistory();
  const summary = usePnlSummary();

  const marginInUse = useMemo(
    () => positions.reduce((sum, o) => sum + (Number(o.margin_locked) || 0), 0),
    [positions],
  );

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
      <OrderHistoryTable orders={history} />
    </div>
  );
}
