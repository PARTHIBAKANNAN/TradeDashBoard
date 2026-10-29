import React, { useMemo } from "react";
import {
  LineChart,
  Wallet,
  Lock,
  Layers,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import Card from "../ui/Card.jsx";
import PositionRow from "./PositionRow.jsx";

export default function PositionsTable({
  positions = [],
  summary,
  marginInUse = 0,
}) {
  const totalExposure = useMemo(
    () =>
      positions.reduce((sum, o) => {
        const price = Number(o.entry_price || o.limit_price) || 0;
        const qty = Number(o.quantity) || 0;
        return sum + price * qty;
      }, 0),
    [positions],
  );

  const lockedMargin = useMemo(
    () =>
      marginInUse ||
      positions.reduce((sum, o) => sum + (Number(o.margin_locked) || 0), 0),
    [positions, marginInUse],
  );

  const availableCash = summary?.balance ?? null;
  const unrealizedPnl = summary?.unrealized_pnl ?? 0;

  return (
    <Card
      title="Positions"
      subtitle="Open + pending paper orders"
      icon={LineChart}
      bodyClassName="p-0"
    >
      {/* Top Financial Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-surface2/60 border-b border-subtle">
        <div className="flex flex-col px-2">
          <span className="text-[10px] uppercase font-bold text-muted flex items-center gap-1">
            <Wallet size={11} className="text-accent-blue" /> Available Cash
          </span>
          <span className="font-mono text-sm font-bold text-primary tabular-nums mt-0.5">
            {availableCash != null
              ? `₹${Number(availableCash).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
              : "—"}
          </span>
        </div>
        <div className="flex flex-col px-2 sm:border-l border-subtle/50">
          <span className="text-[10px] uppercase font-bold text-muted flex items-center gap-1">
            <Lock size={11} className="text-accent-amber" /> Margin Locked
          </span>
          <span className="font-mono text-sm font-bold text-accent-amber tabular-nums mt-0.5">
            ₹{Math.round(lockedMargin).toLocaleString("en-IN")}
          </span>
        </div>
        <div className="flex flex-col px-2 border-l border-subtle/50">
          <span className="text-[10px] uppercase font-bold text-muted flex items-center gap-1">
            <Layers size={11} className="text-accent-violet" /> Total Exposure
          </span>
          <span className="font-mono text-sm font-bold text-primary tabular-nums mt-0.5">
            ₹{Math.round(totalExposure).toLocaleString("en-IN")}
          </span>
        </div>
        <div className="flex flex-col px-2 border-l border-subtle/50">
          <span className="text-[10px] uppercase font-bold text-muted flex items-center gap-1">
            {unrealizedPnl >= 0 ? (
              <TrendingUp size={11} className="text-bull" />
            ) : (
              <TrendingDown size={11} className="text-bear" />
            )}{" "}
            Live P&amp;L
          </span>
          <span
            className={`font-mono text-sm font-bold tabular-nums mt-0.5 ${
              unrealizedPnl >= 0 ? "text-bull" : "text-bear"
            }`}
          >
            {unrealizedPnl >= 0 ? "+" : ""}₹
            {Number(unrealizedPnl).toLocaleString("en-IN", {
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {positions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="hidden md:table-header-group">
              <tr className="bg-surface3/60 border-b border-subtle">
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider">
                  Stock
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                  Side
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  Qty
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  Entry / Limit
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  LTP
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  Margin
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  Exposure
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  SL / Target
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  P&amp;L (ROI)
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((order) => (
                <PositionRow key={order.id} order={order} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center">
          <LineChart size={28} className="mx-auto mb-2 text-faint" />
          <p className="text-faint text-sm">No open or pending orders</p>
        </div>
      )}
    </Card>
  );
}
