import React, { useState } from "react";
import { Wallet, Lock, TrendingUp, TrendingDown, Layers, Plus, RotateCcw } from "lucide-react";
import { depositToWallet, resetWallet } from "../../hooks/useOrders.js";

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

// Wallet + live P&L stat tiles, plus Add Funds / Reset controls. `marginInUse`
// is derived by the caller from the open-positions list (the backend summary
// doesn't track it separately — it's implicit in wallet.balance already
// having margin debited out of it).
export default function WalletSummaryCard({ summary, marginInUse = 0 }) {
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submitDeposit = async (e) => {
    e.preventDefault();
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return;
    setBusy(true);
    try {
      await depositToWallet(amount);
      setDepositAmount("");
      setShowDeposit(false);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        "Reset your wallet balance to ₹1,00,000? Existing open positions are unaffected.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await resetWallet();
    } finally {
      setBusy(false);
    }
  };

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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDeposit((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-subtle bg-surface3 px-2.5 py-1 text-[11px] font-bold text-muted hover:text-accent-blue hover:border-accent-blue/40 transition-colors"
          >
            <Plus size={11} /> Add Funds
          </button>
          <button
            onClick={handleReset}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-subtle bg-surface3 px-2.5 py-1 text-[11px] font-bold text-muted hover:text-accent-amber hover:border-accent-amber/40 disabled:opacity-50 transition-colors"
          >
            <RotateCcw size={11} /> Reset
          </button>
        </div>
        {showDeposit && (
          <form onSubmit={submitDeposit} className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              step="100"
              autoFocus
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Amount"
              className="w-28 bg-surface3 border border-strong rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:border-accent-blue"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-accent-blue px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
            >
              Add
            </button>
          </form>
        )}
      </div>
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
