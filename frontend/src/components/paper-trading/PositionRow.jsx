import React, { useState } from "react";
import { X, Ban, PencilLine, StickyNote } from "lucide-react";
import { useStock } from "../../hooks/useMarketStream.js";
import { cancelOrder, closeOrder } from "../../hooks/useOrders.js";
import EditPositionModal from "./EditPositionModal.jsx";

function unrealizedPnl(side, quantity, entryPrice, ltp) {
  const direction = side === "BUY" ? 1 : -1;
  return Math.round(direction * (ltp - entryPrice) * quantity * 100) / 100;
}

// Self-subscribes to live ticks (like WatchlistRow) so OPEN rows re-render
// only when their own symbol's price actually moves.
export default function PositionRow({ order }) {
  const live = useStock(order.symbol);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isPending = order.status === "PENDING";
  const ltp = live?.ltp || order.ltp;
  const pnl =
    !isPending && ltp
      ? unrealizedPnl(order.side, order.quantity, order.entry_price, ltp)
      : null;

  const act = async (fn) => {
    setBusy(true);
    try {
      await fn(order.id);
    } catch {
      /* surfaced via the shared poll-refresh; nothing row-local to show */
    } finally {
      setBusy(false);
    }
  };

  const bracketText =
    order.sl_price || order.target_price || order.tsl_type ? (
      <span className="text-[11px] text-faint">
        {order.sl_price ? `SL ${order.sl_price}` : ""}
        {order.sl_price && order.target_price ? " / " : ""}
        {order.target_price ? `T ${order.target_price}` : ""}
        {order.tsl_type && (
          <span className="ml-1 text-accent-violet">
            (TSL{" "}
            {order.tsl_type === "PERCENT"
              ? `${order.tsl_value}%`
              : `₹${order.tsl_value}`}
            )
          </span>
        )}
      </span>
    ) : (
      <span className="text-faint">—</span>
    );

  const pnlText =
    pnl == null ? (
      <span className="text-faint">—</span>
    ) : (
      <span
        className={
          pnl >= 0 ? "text-bull font-semibold" : "text-bear font-semibold"
        }
      >
        {pnl >= 0 ? "+" : ""}
        {pnl}
      </span>
    );

  const actions = isPending ? (
    <button
      onClick={() => act(cancelOrder)}
      disabled={busy}
      title="Cancel pending order"
      className="inline-flex items-center gap-1 text-[11px] font-bold text-muted hover:text-bear disabled:opacity-50 transition-colors"
    >
      <Ban size={12} /> Cancel
    </button>
  ) : (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setEditOpen(true)}
        title="Edit SL / TSL / Target"
        className="inline-flex items-center gap-1 text-[11px] font-bold text-muted hover:text-accent-violet transition-colors"
      >
        <PencilLine size={12} /> Edit
      </button>
      <button
        onClick={() => act(closeOrder)}
        disabled={busy}
        title="Exit position at market"
        className="inline-flex items-center gap-1 text-[11px] font-bold text-muted hover:text-bear disabled:opacity-50 transition-colors"
      >
        <X size={12} /> Exit
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop row */}
      <tr className="hidden md:table-row border-b border-subtle/70 hover:bg-surface3/40 transition-colors">
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-primary">{order.symbol}</span>
            {order.notes && (
              <StickyNote
                size={11}
                title={order.notes}
                className="text-accent-violet flex-shrink-0"
              />
            )}
          </div>
          <div className="text-[10px] text-faint">{order.order_type}</div>
        </td>
        <td className="py-2.5 px-4 text-center">
          <span
            className={`text-xs font-bold uppercase ${order.side === "BUY" ? "text-bull" : "text-bear"}`}
          >
            {order.side}
          </span>
        </td>
        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
          {order.quantity}
        </td>
        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
          {isPending ? (
            <span className="text-accent-amber">{order.limit_price}</span>
          ) : (
            order.entry_price
          )}
        </td>
        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
          {isPending ? "—" : (ltp ?? "—")}
        </td>
        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
          {bracketText}
        </td>
        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
          {pnlText}
        </td>
        <td className="py-2.5 px-4 text-center">{actions}</td>
      </tr>

      {/* Mobile card — kept inside a tr/td so table markup stays valid */}
      <tr className="md:hidden border-b border-subtle/70">
        <td colSpan={8} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-primary text-sm">
                  {order.symbol}
                </span>
                <span
                  className={`text-[11px] font-bold uppercase ${order.side === "BUY" ? "text-bull" : "text-bear"}`}
                >
                  {order.side}
                </span>
                <span className="text-[10px] text-faint">
                  {order.order_type}
                </span>
                {order.notes && (
                  <StickyNote
                    size={11}
                    title={order.notes}
                    className="text-accent-violet flex-shrink-0"
                  />
                )}
              </div>
              <div className="text-[11px] text-faint mt-0.5">
                Qty {order.quantity} @{" "}
                {isPending ? order.limit_price : order.entry_price}
                {!isPending && <> · LTP {ltp ?? "—"}</>}
              </div>
            </div>
            <div className="text-right font-mono tabular-nums text-sm">
              {pnlText}
            </div>
          </div>
          <div className="mt-1.5">{bracketText}</div>
          <div className="mt-2 flex items-center justify-end">{actions}</div>
        </td>
      </tr>

      {editOpen && (
        <EditPositionModal order={order} onClose={() => setEditOpen(false)} />
      )}
    </>
  );
}
