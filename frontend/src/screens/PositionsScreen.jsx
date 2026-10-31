import React, { useMemo, useState } from "react";
import {
  Rocket,
  LineChart,
  TrendingUp,
  TrendingDown,
  Layers,
  Wallet,
  Lock,
} from "lucide-react";
import Card from "../components/ui/Card.jsx";
import PlaceOrderForm from "../components/paper-trading/PlaceOrderForm.jsx";
import PositionsTable from "../components/paper-trading/PositionsTable.jsx";
import TodayClosedPositions from "../components/paper-trading/TodayClosedPositions.jsx";
import ChartModal from "../components/ChartModal.jsx";
import {
  usePositions,
  useOrderHistory,
  usePnlSummary,
  usePaperTradingSync,
} from "../hooks/useOrders.js";

export default function PositionsScreen({ stocks }) {
  usePaperTradingSync();
  const positions = usePositions();
  const history = useOrderHistory();
  const summary = usePnlSummary();
  const [closedChartSymbol, setClosedChartSymbol] = useState(null);

  const marginInUse = useMemo(
    () => positions.reduce((sum, o) => sum + (Number(o.margin_locked) || 0), 0),
    [positions],
  );

  // Filter for orders closed today
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayClosedOrders = useMemo(() => {
    return history.filter((o) => {
      const isClosed = o.status === "CLOSED" || o.exit_price != null;
      if (!isClosed) return false;
      const closedAt = o.closed_at || o.updated_at || "";
      const createdAt = o.created_at || o.placed_at || "";
      return closedAt.startsWith(todayIso) || createdAt.startsWith(todayIso);
    });
  }, [history, todayIso]);

  // Overall today realized net P&L
  const todayNetPnl = useMemo(() => {
    return todayClosedOrders.reduce(
      (sum, o) => sum + (Number(o.net_pnl ?? o.pnl) || 0),
      0,
    );
  }, [todayClosedOrders]);

  const unrealizedPnl = Number(summary?.unrealized_pnl || 0);
  const totalDayPnl = todayNetPnl + unrealizedPnl;

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-[1920px] w-full px-3 sm:px-6 py-4 space-y-4">
        {/* Top Session Pulse Bar */}
        <div className="bg-surface2/70 border border-subtle/80 rounded-2xl p-3 sm:p-4 shadow-sm flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-primary font-display flex items-center gap-2">
                Active Trading Desk
                <span className="text-[10px] bg-accent-blue/15 text-accent-blue border border-accent-blue/30 px-2 py-0.5 rounded-full uppercase font-mono">
                  Live Desk
                </span>
              </h2>
              <p className="text-[11px] text-faint">
                Real-time intraday execution & position management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            {/* Today Net Realized P&L */}
            <div className="bg-surface3/60 px-3 py-1.5 rounded-xl border border-border-subtle/60 flex items-center gap-2">
              <span className="text-[10px] text-faint uppercase font-bold">
                Today Net P&L:
              </span>
              <span
                className={`font-mono text-xs sm:text-sm font-black ${
                  todayNetPnl >= 0 ? "text-bull" : "text-bear"
                }`}
              >
                {todayNetPnl >= 0 ? "+" : ""}₹{todayNetPnl.toFixed(2)}
              </span>
            </div>

            {/* Live Unrealized */}
            {positions.length > 0 && (
              <div className="bg-surface3/60 px-3 py-1.5 rounded-xl border border-border-subtle/60 flex items-center gap-2">
                <span className="text-[10px] text-faint uppercase font-bold">
                  Open Floating:
                </span>
                <span
                  className={`font-mono text-xs sm:text-sm font-black ${
                    unrealizedPnl >= 0 ? "text-bull" : "text-bear"
                  }`}
                >
                  {unrealizedPnl >= 0 ? "+" : ""}₹{unrealizedPnl.toFixed(2)}
                </span>
              </div>
            )}

            {/* Margin Info Badge */}
            <div className="hidden md:flex items-center gap-2 text-xs text-muted font-mono bg-surface/50 px-3 py-1.5 rounded-xl border border-subtle">
              <span className="flex items-center gap-1">
                <Wallet size={12} className="text-accent-blue" />
                Avail: ₹
                {Number(summary?.balance || 0).toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1 text-accent-amber">
                <Lock size={12} />
                Used: ₹{Math.round(marginInUse).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Split: Left = Place Order, Right = Open + Closed Positions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Place Order Desk */}
          <div className="lg:col-span-4 xl:col-span-4">
            <Card title="Place Order" icon={Rocket} className="shadow-sm">
              <PlaceOrderForm stocks={stocks} />
            </Card>
          </div>

          {/* Right Column: Positions & Today's Performance */}
          <div className="lg:col-span-8 xl:col-span-8 space-y-4">
            {/* Active Open Positions Table */}
            <PositionsTable
              positions={positions}
              summary={summary}
              marginInUse={marginInUse}
            />

            {/* Today's Closed Positions Section */}
            <TodayClosedPositions
              orders={todayClosedOrders}
              onOpenChart={(sym) => setClosedChartSymbol(sym)}
            />
          </div>
        </div>

        {closedChartSymbol && (
          <ChartModal
            symbol={closedChartSymbol}
            onClose={() => setClosedChartSymbol(null)}
          />
        )}
      </div>
    </div>
  );
}
