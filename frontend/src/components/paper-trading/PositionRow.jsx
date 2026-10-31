import React, { useState } from "react";
import { X, Ban, PencilLine, StickyNote, LineChart } from "lucide-react";
import { useStock } from "../../hooks/useMarketStream.js";
import { cancelOrder, closeOrder } from "../../hooks/useOrders.js";
import EditPositionModal from "./EditPositionModal.jsx";
import ExitReasonModal from "./ExitReasonModal.jsx";
import TradeProgressSlider from "./TradeProgressSlider.jsx";

function formatTime(isoStr) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function unrealizedPnl(side, quantity, entryPrice, ltp) {
  const direction = side === "BUY" ? 1 : -1;
  return Math.round(direction * (ltp - entryPrice) * quantity * 100) / 100;
}

// Self-subscribes to live ticks (like WatchlistRow) so OPEN rows re-render
// only when their own symbol's price actually moves.
export default function PositionRow({ order, onOpenChart, onOrderClosed }) {
  const live = useStock(order.symbol);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isPending = order.status === "PENDING";
  const ltp = live?.ltp || order.ltp;
  const pnl =
    !isPending && ltp
      ? unrealizedPnl(order.side, order.quantity, order.entry_price, ltp)
      : null;

  const entryPrice = Number(order.entry_price || order.limit_price) || 0;
  const quantity = Number(order.quantity) || 0;
  const totalExposure = entryPrice * quantity;
  const marginLocked =
    Number(order.margin_locked) ||
    (totalExposure > 0 ? Math.round(totalExposure / 5) : 0);
  const leverage =
    marginLocked > 0 ? Math.round(totalExposure / marginLocked) : 5;
  const roi =
    marginLocked > 0 && pnl != null
      ? Math.round((pnl / marginLocked) * 1000) / 10
      : null;

  const entryTimeStr = order.filled_at
    ? formatTime(order.filled_at)
    : order.placed_at
      ? formatTime(order.placed_at)
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

  const handleImmediateExit = async () => {
    setBusy(true);
    try {
      await closeOrder(order.id);
      if (onOrderClosed) {
        onOrderClosed(order);
      }
    } catch {
      /* surfaced via refresh */
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
        onClick={handleImmediateExit}
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
            <button
              onClick={() => onOpenChart?.(order.symbol)}
              className="font-bold text-primary hover:text-accent-blue transition-colors flex items-center gap-1 group text-left cursor-pointer"
              title="Click to view chart with SL/TP levels"
            >
              <span>{order.symbol}</span>
              <LineChart
                size={12}
                className="opacity-0 group-hover:opacity-100 text-accent-blue transition-opacity"
              />
            </button>
            {order.notes && (
              <StickyNote
                size={11}
                title={order.notes}
                className="text-accent-violet flex-shrink-0"
              />
            )}
          </div>
          <div className="text-[10px] text-faint flex items-center gap-1.5 mt-0.5">
            <span>{order.order_type}</span>
            {entryTimeStr && (
              <>
                <span>·</span>
                <span
                  className="font-mono text-muted"
                  title={isPending ? "Placed Time" : "Entry Time"}
                >
                  {entryTimeStr}
                </span>
              </>
            )}
          </div>
        </td>
        <td className="py-2.5 px-4 text-center">
          <span
            className={`text-xs font-bold uppercase ${
              order.side === "BUY" ? "text-bull" : "text-bear"
            }`}
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
          <div className="text-xs font-semibold text-primary">
            ₹{Math.round(marginLocked).toLocaleString("en-IN")}
          </div>
          <div className="text-[10px] text-accent-amber font-bold">
            {leverage}x
          </div>
        </td>
        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-muted">
          ₹{Math.round(totalExposure).toLocaleString("en-IN")}
        </td>
        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
          {bracketText}
        </td>
        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
          {pnl == null ? (
            <span className="text-faint">—</span>
          ) : (
            <div>
              <div
                className={`text-xs font-bold ${
                  pnl >= 0 ? "text-bull" : "text-bear"
                }`}
              >
                {pnl >= 0 ? "+" : ""}₹{pnl}
              </div>
              {roi != null && (
                <div
                  className={`text-[10px] font-semibold ${
                    roi >= 0 ? "text-bull" : "text-bear"
                  }`}
                >
                  {roi >= 0 ? "+" : ""}
                  {roi}% ROI
                </div>
              )}
            </div>
          )}
        </td>
        <td className="py-2.5 px-4 text-center">{actions}</td>
      </tr>
      {order.sl_price && (
        <tr className="hidden md:table-row bg-surface2/30 border-b border-subtle/40">
          <td colSpan={10} className="px-4 py-1.5">
            <TradeProgressSlider
              side={order.side}
              entryPrice={entryPrice}
              slPrice={order.sl_price}
              targetPrice={order.target_price}
              tslPrice={order.tsl_price || order.current_sl}
              ltp={ltp}
            />
          </td>
        </tr>
      )}

      {/* Mobile card — kept inside a tr/td so table markup stays valid */}
      <tr className="md:hidden border-b border-subtle/70">
        <td colSpan={10} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenChart?.(order.symbol)}
                  className="font-bold text-primary hover:text-accent-blue transition-colors flex items-center gap-1 group text-left text-sm"
                  title="Click to view chart with SL/TP levels"
                >
                  <span>{order.symbol}</span>
                  <LineChart
                    size={12}
                    className="text-accent-blue opacity-70"
                  />
                </button>
                <span
                  className={`text-[11px] font-bold uppercase ${
                    order.side === "BUY" ? "text-bull" : "text-bear"
                  }`}
                >
                  {order.side}
                </span>
                <span className="text-[10px] text-faint">
                  {order.order_type}
                  {entryTimeStr && ` · ${entryTimeStr}`}
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
              <div className="text-[10px] font-mono text-muted flex items-center gap-1.5 mt-1">
                <span>
                  Margin:{" "}
                  <strong className="text-primary font-bold">
                    ₹{Math.round(marginLocked).toLocaleString("en-IN")}
                  </strong>{" "}
                  ({leverage}x)
                </span>
                <span>·</span>
                <span>
                  Exp: ₹{Math.round(totalExposure).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
            <div className="text-right font-mono tabular-nums">
              {pnl == null ? (
                <span className="text-faint text-sm">—</span>
              ) : (
                <>
                  <div
                    className={`text-sm font-bold ${
                      pnl >= 0 ? "text-bull" : "text-bear"
                    }`}
                  >
                    {pnl >= 0 ? "+" : ""}₹{pnl}
                  </div>
                  {roi != null && (
                    <div
                      className={`text-[10px] font-semibold ${
                        roi >= 0 ? "text-bull" : "text-bear"
                      }`}
                    >
                      {roi >= 0 ? "+" : ""}
                      {roi}% ROI
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="mt-1.5">{bracketText}</div>
          {order.sl_price && (
            <div className="mt-2">
              <TradeProgressSlider
                side={order.side}
                entryPrice={entryPrice}
                slPrice={order.sl_price}
                targetPrice={order.target_price}
                tslPrice={order.tsl_price || order.current_sl}
                ltp={ltp}
              />
            </div>
          )}
          <div className="mt-2 flex items-center justify-end">{actions}</div>
        </td>
      </tr>

      {editOpen && (
        <EditPositionModal order={order} onClose={() => setEditOpen(false)} />
      )}
    </>
  );
}
