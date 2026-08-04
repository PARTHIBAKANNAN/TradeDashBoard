import React from "react";
import { Wallet, Lock, TrendingUp, TrendingDown, Layers } from "lucide-react";

function formatMoney(v) {
  const n = Number(v) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function Tile({ icon: Icon, label, value, tone = "text-primary" }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface3/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
        <Icon size={11} />
        {label}
      </div>
      <div className={`font-mono text-sm font-bold tabular-nums ${tone}`}>
        {value}
      </div>
    </div>
  );
}

// Wallet + live P&L stat tiles. `marginInUse` is derived by the caller from
// the open-positions list (the backend summary doesn't track it separately —
// it's implicit in wallet.balance already having margin debited out of it).
export default function WalletSummaryCard({ summary, marginInUse = 0 }) {
  if (!summary) {
    return (
      <div className="rounded-xl border border-subtle bg-surface2/70 backdrop-blur-xl shadow-card px-5 py-4 text-sm text-faint">
        Loading wallet…
      </div>
    );
  }

  const realizedPositive = summary.realized_pnl >= 0;
  const unrealizedPositive = summary.unrealized_pnl >= 0;
  const totalPositive = summary.total_pnl >= 0;

  return (
    <div className="rounded-xl border border-subtle bg-surface2/70 backdrop-blur-xl shadow-card p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Tile
          icon={Wallet}
          label="Available"
          value={formatMoney(summary.balance)}
        />
        <Tile
          icon={Lock}
          label="Margin in Use"
          value={formatMoney(marginInUse)}
        />
        <Tile
          icon={realizedPositive ? TrendingUp : TrendingDown}
          label="Realized P&L"
          value={formatMoney(summary.realized_pnl)}
          tone={realizedPositive ? "text-bull" : "text-bear"}
        />
        <Tile
          icon={unrealizedPositive ? TrendingUp : TrendingDown}
          label="Unrealized P&L"
          value={formatMoney(summary.unrealized_pnl)}
          tone={unrealizedPositive ? "text-bull" : "text-bear"}
        />
        <Tile
          icon={totalPositive ? TrendingUp : TrendingDown}
          label="Total P&L"
          value={formatMoney(summary.total_pnl)}
          tone={totalPositive ? "text-bull" : "text-bear"}
        />
        <Tile icon={Layers} label="Open Positions" value={summary.open_count} />
      </div>
    </div>
  );
}
