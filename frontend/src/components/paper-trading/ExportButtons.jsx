import React from "react";
import { Download } from "lucide-react";
import { toCsv, downloadCsv } from "../../utils/csvExport.js";

const COLUMN_SETS = {
  orders: {
    label: "Orders",
    columns: [
      { key: "symbol", label: "Symbol" },
      { key: "side", label: "Side" },
      { key: "quantity", label: "Quantity" },
      { key: "order_type", label: "Order Type" },
      { key: "entry_price", label: "Entry Price" },
      { key: "exit_price", label: "Exit Price" },
      { key: "close_reason", label: "Close Reason" },
      { key: "placed_at", label: "Placed At" },
      { key: "closed_at", label: "Closed At" },
    ],
  },
  pnl: {
    label: "P&L",
    columns: [
      { key: "symbol", label: "Symbol" },
      { key: "entry_price", label: "Entry Price" },
      { key: "exit_price", label: "Exit Price" },
      { key: "realized_pnl", label: "Gross P&L" },
      { key: "total_charges", label: "Total Charges" },
      { key: "net_pnl", label: "Net P&L" },
    ],
  },
  tax: {
    label: "Tax",
    columns: [
      { key: "symbol", label: "Symbol" },
      { key: "stt", label: "STT" },
      { key: "stamp_duty", label: "Stamp Duty" },
      { key: "sebi_charges", label: "SEBI Charges" },
    ],
  },
  brokerage: {
    label: "Brokerage",
    columns: [
      { key: "symbol", label: "Symbol" },
      { key: "brokerage", label: "Brokerage" },
      { key: "exchange_charges", label: "Exchange Charges" },
      { key: "gst", label: "GST" },
    ],
  },
  combined: {
    label: "Combined",
    columns: [
      { key: "symbol", label: "Symbol" },
      { key: "side", label: "Side" },
      { key: "quantity", label: "Quantity" },
      { key: "order_type", label: "Order Type" },
      { key: "entry_price", label: "Entry Price" },
      { key: "exit_price", label: "Exit Price" },
      { key: "close_reason", label: "Close Reason" },
      { key: "realized_pnl", label: "Gross P&L" },
      { key: "brokerage", label: "Brokerage" },
      { key: "stt", label: "STT" },
      { key: "exchange_charges", label: "Exchange Charges" },
      { key: "sebi_charges", label: "SEBI Charges" },
      { key: "stamp_duty", label: "Stamp Duty" },
      { key: "gst", label: "GST" },
      { key: "total_charges", label: "Total Charges" },
      { key: "net_pnl", label: "Net P&L" },
      { key: "placed_at", label: "Placed At" },
      { key: "closed_at", label: "Closed At" },
    ],
  },
};

// Every export is client-side — built from the same date-filtered `orders`
// array already backing the on-screen history table, just a narrower or
// wider column subset per button.
export default function ExportButtons({ orders }) {
  const closed = (orders || []).filter((o) => o.status === "CLOSED" || o.status === "CANCELLED");

  const exportSection = (key) => {
    const { columns } = COLUMN_SETS[key];
    const csv = toCsv(closed, columns);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`paper-trading-${key}-${stamp}.csv`, csv);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {Object.entries(COLUMN_SETS).map(([key, { label }]) => (
        <button
          key={key}
          type="button"
          onClick={() => exportSection(key)}
          disabled={closed.length === 0}
          title={`Export ${label} as CSV`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-surface3 px-3 py-1.5 text-xs font-semibold text-muted hover:text-accent-blue hover:border-accent-blue/40 disabled:opacity-40 transition-colors"
        >
          <Download size={12} /> {label}
        </button>
      ))}
    </div>
  );
}
