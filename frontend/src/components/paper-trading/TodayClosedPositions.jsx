import React from "react";
import { CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";

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

function calculateDuration(startIso, endIso) {
  if (!startIso || !endIso) return "";
  try {
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    const diffMin = Math.round((e - s) / 60000);
    if (diffMin < 60) return `${diffMin}m`;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `${h}h ${m}m`;
  } catch {
    return "";
  }
}

export default function TodayClosedPositions({ orders = [], onOpenChart }) {
  if (!orders || orders.length === 0) {
    return (
      <div className="bg-surface2/40 border border-subtle/60 rounded-2xl p-6 text-center text-faint text-xs">
        No trades closed yet today. Active trades will appear here once exited.
      </div>
    );
  }

  // Calculate day totals
  const totalNetPnl = orders.reduce(
    (sum, o) => sum + (Number(o.net_pnl ?? o.pnl) || 0),
    0
  );
  const totalCharges = orders.reduce(
    (sum, o) => sum + (Number(o.total_charges) || 0),
    0
  );
  const winCount = orders.filter(
    (o) => (Number(o.net_pnl ?? o.pnl) || 0) > 0
  ).length;

  return (
    <div className="bg-surface2/50 border border-subtle/80 rounded-2xl overflow-hidden shadow-sm">
      {/* Header bar */}
      <div className="px-4 py-3 border-b border-subtle/70 flex items-center justify-between flex-wrap gap-2 bg-surface2/80">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <h3 className="text-xs font-bold text-primary tracking-wide uppercase font-display">
            Today's Closed Trades ({orders.length})
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-faint">
            Win Rate:{" "}
            <span className="text-primary font-bold">
              {Math.round((winCount / orders.length) * 100)}% ({winCount}W /{" "}
              {orders.length - winCount}L)
            </span>
          </span>
          <span className="text-faint">
            Charges:{" "}
            <span className="text-amber-400 font-semibold">
              ₹{totalCharges.toFixed(2)}
            </span>
          </span>
          <span
            className={`font-bold px-2 py-0.5 rounded ${
              totalNetPnl >= 0
                ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/40"
                : "bg-rose-950/80 text-rose-400 border border-rose-800/40"
            }`}
          >
            Net: {totalNetPnl >= 0 ? "+" : ""}₹{totalNetPnl.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-subtle/60 text-[10px] text-faint uppercase tracking-wider bg-surface3/40">
              <th className="py-2.5 px-3">Stock</th>
              <th className="py-2.5 px-3">Side</th>
              <th className="py-2.5 px-3 text-right">Qty</th>
              <th className="py-2.5 px-3">Timing & Duration</th>
              <th className="py-2.5 px-3 text-right">Entry</th>
              <th className="py-2.5 px-3 text-right">Exit</th>
              <th className="py-2.5 px-3 text-center">Exit Reason</th>
              <th className="py-2.5 px-3 text-right">Charges</th>
              <th className="py-2.5 px-3 text-right">Net P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle/40 font-mono">
            {orders.map((o) => {
              const net = Number(o.net_pnl ?? o.pnl) || 0;
              const gross = Number(o.pnl) || 0;
              const charges = Number(o.total_charges) || 0;
              const isProfit = net >= 0;
              const isBuy = o.side === "BUY";
              const duration = calculateDuration(
                o.filled_at || o.placed_at || o.created_at,
                o.closed_at
              );

              // Reason badge style
              const reason = (o.exit_reason || "Manual").toUpperCase();
              let reasonBadgeClass = "bg-surface3 text-muted border-border-subtle";
              if (reason.includes("TARGET")) {
                reasonBadgeClass = "bg-emerald-950/80 text-emerald-400 border-emerald-800/50";
              } else if (reason.includes("TRAILING") || reason.includes("TSL")) {
                reasonBadgeClass = "bg-amber-950/80 text-amber-400 border-amber-800/50";
              } else if (reason.includes("STOP")) {
                reasonBadgeClass = "bg-rose-950/80 text-rose-400 border-rose-800/50";
              }

              return (
                <tr key={o.id} className="hover:bg-surface3/30 transition-colors">
                  <td className="py-2.5 px-3 font-sans font-bold text-primary">
                    <button
                      onClick={() => onOpenChart?.(o.symbol)}
                      className="hover:text-accent-blue transition-colors text-left"
                      title="Click to view chart"
                    >
                      {o.symbol}
                    </button>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black ${
                        isBuy
                          ? "bg-emerald-950/60 text-bull border border-bull/30"
                          : "bg-rose-950/60 text-bear border border-bear/30"
                      }`}
                    >
                      {isBuy ? (
                        <ArrowUpRight size={10} />
                      ) : (
                        <ArrowDownRight size={10} />
                      )}
                      {o.side}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium text-muted">
                    {o.quantity}
                  </td>
                  <td className="py-2.5 px-3 text-faint text-[11px]">
                    <div className="flex items-center gap-1">
                      <span>{formatTime(o.filled_at || o.placed_at || o.created_at)}</span>
                      <span>→</span>
                      <span>{formatTime(o.closed_at)}</span>
                    </div>
                    {duration && (
                      <span className="text-[10px] text-faint/70 flex items-center gap-0.5">
                        <Clock size={9} /> {duration}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right text-primary">
                    ₹{Number(o.entry_price || o.price || 0).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-primary font-semibold">
                    ₹{Number(o.exit_price || 0).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${reasonBadgeClass}`}
                    >
                      {o.exit_reason || "Manual"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-faint">
                    ₹{charges.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div
                      className={`font-bold ${
                        isProfit ? "text-bull" : "text-bear"
                      }`}
                    >
                      {isProfit ? "+" : ""}₹{net.toFixed(2)}
                    </div>
                    {charges > 0 && (
                      <div className="text-[9px] text-faint">
                        gross {gross >= 0 ? "+" : ""}
                        {gross.toFixed(2)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

