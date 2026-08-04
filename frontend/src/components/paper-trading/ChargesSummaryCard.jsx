import React, { useMemo } from "react";
import { Receipt, Landmark, ReceiptText, Percent, Wallet2, Scale } from "lucide-react";

function formatMoney(v) {
  const n = Number(v) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function sum(orders, key) {
  return orders.reduce((total, o) => total + (Number(o[key]) || 0), 0);
}

function Tile({ icon: Icon, label, value, tone = "text-primary" }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface3/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
        <Icon size={11} />
        {label}
      </div>
      <div className={`font-mono text-sm font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

// Aggregated brokerage/tax totals for whatever date-filtered `orders` the
// caller has already fetched — no separate backend aggregate endpoint, this
// is a plain sum over the same rows the history table and exports both use.
export default function ChargesSummaryCard({ orders, rangeLabel }) {
  const totals = useMemo(() => {
    const closed = (orders || []).filter((o) => o.status === "CLOSED");
    return {
      brokerage: sum(closed, "brokerage"),
      stt: sum(closed, "stt"),
      stampDuty: sum(closed, "stamp_duty"),
      exchangeAndSebi: sum(closed, "exchange_charges") + sum(closed, "sebi_charges"),
      gst: sum(closed, "gst"),
      totalCharges: sum(closed, "total_charges"),
      grossPnl: sum(closed, "realized_pnl"),
      netPnl: sum(closed, "net_pnl"),
    };
  }, [orders]);

  const netPositive = totals.netPnl >= 0;

  return (
    <div className="rounded-xl border border-subtle bg-surface2/70 backdrop-blur-xl shadow-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-3">
        <Receipt size={12} className="text-accent-blue" />
        Tax &amp; Brokerage
        {rangeLabel && <span className="text-faint font-normal">· {rangeLabel}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <Tile icon={Landmark} label="Brokerage" value={formatMoney(totals.brokerage)} />
        <Tile icon={ReceiptText} label="STT" value={formatMoney(totals.stt)} />
        <Tile icon={ReceiptText} label="Stamp Duty" value={formatMoney(totals.stampDuty)} />
        <Tile icon={Scale} label="Exchange + SEBI" value={formatMoney(totals.exchangeAndSebi)} />
        <Tile icon={Percent} label="GST" value={formatMoney(totals.gst)} />
        <Tile icon={Wallet2} label="Total Charges" value={formatMoney(totals.totalCharges)} tone="text-accent-amber" />
        <Tile
          icon={Wallet2}
          label="Net P&L"
          value={formatMoney(totals.netPnl)}
          tone={netPositive ? "text-bull" : "text-bear"}
        />
      </div>
    </div>
  );
}
