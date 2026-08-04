import React from "react";
import { History, StickyNote } from "lucide-react";
import Card from "../ui/Card.jsx";

const REASON_LABEL = {
  MANUAL: "Manual",
  SL: "Stop Loss",
  TARGET: "Target",
  SQUARE_OFF: "Square-off",
};

export default function OrderHistoryTable({ orders }) {
  return (
    <Card
      title="Order History"
      subtitle="Closed + cancelled orders"
      icon={History}
      bodyClassName="p-0"
    >
      {orders.length > 0 ? (
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left border-collapse">
            <thead className="hidden md:table-header-group">
              <tr className="bg-surface3/60 border-b border-subtle sticky top-0">
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
                  Entry
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  Exit
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                  Reason
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  Charges
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                  Net P&amp;L
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const netPnl = o.net_pnl;
                const grossPnl = o.realized_pnl;
                const cancelled = o.status === "CANCELLED";
                const chargesTitle = cancelled
                  ? undefined
                  : `Brokerage ₹${o.brokerage ?? 0} · STT ₹${o.stt ?? 0} · Exchange ₹${o.exchange_charges ?? 0} · SEBI ₹${o.sebi_charges ?? 0} · Stamp Duty ₹${o.stamp_duty ?? 0} · GST ₹${o.gst ?? 0}`;
                const reasonText = cancelled
                  ? "Cancelled"
                  : REASON_LABEL[o.close_reason] || "—";
                const chargesText =
                  o.total_charges == null ? (
                    <span className="text-faint">—</span>
                  ) : (
                    <span className="text-accent-amber">
                      ₹{o.total_charges}
                    </span>
                  );
                const pnlText =
                  netPnl == null ? (
                    <span className="text-faint">—</span>
                  ) : (
                    <>
                      <span
                        className={
                          netPnl >= 0
                            ? "text-bull font-semibold"
                            : "text-bear font-semibold"
                        }
                      >
                        {netPnl >= 0 ? "+" : ""}
                        {netPnl}
                      </span>
                      <div className="text-[10px] text-faint">
                        gross {grossPnl >= 0 ? "+" : ""}
                        {grossPnl}
                      </div>
                    </>
                  );
                return (
                  <React.Fragment key={o.id}>
                    {/* Desktop row */}
                    <tr className="hidden md:table-row border-b border-subtle/70 hover:bg-surface3/40 transition-colors">
                      <td className="py-2.5 px-4 font-semibold text-primary">
                        <div className="flex items-center gap-1.5">
                          <span>{o.symbol}</span>
                          {o.notes && (
                            <StickyNote
                              size={11}
                              title={o.notes}
                              className="text-accent-violet flex-shrink-0"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`text-xs font-bold uppercase ${o.side === "BUY" ? "text-bull" : "text-bear"}`}
                        >
                          {o.side}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {o.quantity}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {o.entry_price ?? "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {o.exit_price ?? "—"}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="text-[11px] font-semibold text-faint">
                          {reasonText}
                        </span>
                      </td>
                      <td
                        className="py-2.5 px-4 text-right font-mono tabular-nums"
                        title={chargesTitle}
                      >
                        {chargesText}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {pnlText}
                      </td>
                    </tr>

                    {/* Mobile card */}
                    <tr className="md:hidden border-b border-subtle/70">
                      <td colSpan={8} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-primary text-sm">
                                {o.symbol}
                              </span>
                              <span
                                className={`text-[11px] font-bold uppercase ${o.side === "BUY" ? "text-bull" : "text-bear"}`}
                              >
                                {o.side}
                              </span>
                              <span className="text-[11px] font-semibold text-faint">
                                {reasonText}
                              </span>
                              {o.notes && (
                                <StickyNote
                                  size={11}
                                  title={o.notes}
                                  className="text-accent-violet flex-shrink-0"
                                />
                              )}
                            </div>
                            <div className="text-[11px] text-faint mt-0.5">
                              Qty {o.quantity} · {o.entry_price ?? "—"} →{" "}
                              {o.exit_price ?? "—"}
                            </div>
                            <div
                              className="text-[11px] font-mono mt-0.5"
                              title={chargesTitle}
                            >
                              Charges {chargesText}
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums text-sm">
                            {pnlText}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center">
          <History size={28} className="mx-auto mb-2 text-faint" />
          <p className="text-faint text-sm">No closed orders yet</p>
        </div>
      )}
    </Card>
  );
}
