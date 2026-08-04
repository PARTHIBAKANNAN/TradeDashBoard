import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { fetchMargin, placeOrder } from "../../hooks/useOrders.js";
import TslFields from "./TslFields.jsx";

// Above this % of available balance used as margin, the confirm step shows
// an amber risk line rather than a separate warning flow.
const HIGH_RISK_WALLET_PCT = 25;

const SIDES = ["BUY", "SELL"];
const ORDER_TYPES = ["MARKET", "LIMIT"];

// Order-ticket form: symbol + side + order type + qty + optional bracket
// SL/Target. Recomputes the live "how many shares can I afford" figure from
// /api/paper/margin as symbol/qty change, mirroring a real broker's ticket.
export default function PlaceOrderForm({
  stocks,
  defaultSymbol,
  lockSymbol = false,
  onPlaced,
}) {
  const symbols = useMemo(
    () => (stocks || []).map((s) => s.symbol).sort(),
    [stocks],
  );
  const [symbol, setSymbol] = useState(defaultSymbol || symbols[0] || "");
  const [side, setSide] = useState("BUY");
  const [orderType, setOrderType] = useState("MARKET");
  const [quantity, setQuantity] = useState(1);
  const [limitPrice, setLimitPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [tslType, setTslType] = useState("");
  const [tslValue, setTslValue] = useState("");
  const [notes, setNotes] = useState("");
  const [margin, setMargin] = useState(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!symbol && symbols.length) setSymbol(symbols[0]);
  }, [symbols, symbol]);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setMarginLoading(true);
    fetchMargin(symbol)
      .then((j) => {
        if (!cancelled) setMargin(j);
      })
      .catch(() => {
        if (!cancelled) setMargin(null);
      })
      .finally(() => {
        if (!cancelled) setMarginLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, quantity]);

  const positionValue =
    margin && margin.ltp
      ? (orderType === "LIMIT" && limitPrice
          ? Number(limitPrice)
          : margin.ltp) * (Number(quantity) || 0)
      : null;
  const requiredMargin =
    positionValue != null && margin
      ? Math.round(positionValue / margin.leverage)
      : null;
  const overBudget =
    requiredMargin != null &&
    margin &&
    requiredMargin > margin.available_balance;
  const walletPct =
    requiredMargin != null && margin && margin.available_balance
      ? (requiredMargin / margin.available_balance) * 100
      : null;
  const highRisk = walletPct != null && walletPct > HIGH_RISK_WALLET_PCT;

  const validate = () => {
    setError("");
    if (!symbol) return false;
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setError("Quantity must be a positive whole number.");
      return false;
    }
    if (orderType === "LIMIT" && (!limitPrice || Number(limitPrice) <= 0)) {
      setError("Limit price is required for a LIMIT order.");
      return false;
    }
    if (tslType && (!tslValue || Number(tslValue) <= 0)) {
      setError(
        "Trailing stop value is required when a trail type is selected.",
      );
      return false;
    }
    return true;
  };

  const submit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    setBusy(true);
    setError("");
    try {
      await placeOrder({
        symbol,
        side,
        quantity: Number(quantity),
        order_type: orderType,
        limit_price: orderType === "LIMIT" ? Number(limitPrice) : undefined,
        sl_price: slPrice ? Number(slPrice) : undefined,
        target_price: targetPrice ? Number(targetPrice) : undefined,
        tsl_type: tslType || undefined,
        tsl_value: tslType && tslValue ? Number(tslValue) : undefined,
        notes: notes.trim() || undefined,
      });
      setSlPrice("");
      setTargetPrice("");
      setTslType("");
      setTslValue("");
      setNotes("");
      if (orderType === "LIMIT") setLimitPrice("");
      setShowConfirm(false);
      onPlaced?.();
    } catch (err) {
      setError(err.message || "Order rejected.");
      setShowConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
            Symbol
          </label>
          {lockSymbol ? (
            <div className="w-full bg-surface3 border border-subtle rounded-lg p-2 text-sm font-bold text-primary">
              {symbol}
            </div>
          ) : (
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-surface3 border border-strong rounded-lg p-2 text-sm focus:outline-none focus:border-accent-blue"
            >
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
            Quantity
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full bg-surface3 border border-strong rounded-lg p-2 text-sm font-mono focus:outline-none focus:border-accent-blue"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {SIDES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition-colors border ${
              side === s
                ? s === "BUY"
                  ? "bg-bull/15 border-bull/40 text-bull"
                  : "bg-bear/15 border-bear/40 text-bear"
                : "bg-surface3 border-subtle text-muted hover:text-primary"
            }`}
          >
            {s === "BUY" ? (
              <ArrowUpCircle size={14} />
            ) : (
              <ArrowDownCircle size={14} />
            )}
            {s}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
          Order Type
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ORDER_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors border ${
                orderType === t
                  ? "bg-accent-blue/15 border-accent-blue/40 text-accent-blue"
                  : "bg-surface3 border-subtle text-muted hover:text-primary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {orderType === "LIMIT" && (
        <div>
          <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
            Limit Price
          </label>
          <input
            type="number"
            step="0.05"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder={margin?.ltp ? String(margin.ltp) : ""}
            className="w-full bg-surface3 border border-strong rounded-lg p-2 text-sm font-mono focus:outline-none focus:border-accent-blue"
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
            Stop Loss <span className="text-faint font-normal">(optional)</span>
          </label>
          <input
            type="number"
            step="0.05"
            value={slPrice}
            onChange={(e) => setSlPrice(e.target.value)}
            className="w-full bg-surface3 border border-strong rounded-lg p-2 text-sm font-mono focus:outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
            Target <span className="text-faint font-normal">(optional)</span>
          </label>
          <input
            type="number"
            step="0.05"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            className="w-full bg-surface3 border border-strong rounded-lg p-2 text-sm font-mono focus:outline-none focus:border-accent-blue"
          />
        </div>
      </div>

      <TslFields
        tslType={tslType}
        tslValue={tslValue}
        onTypeChange={setTslType}
        onValueChange={setTslValue}
      />

      <div>
        <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
          Journal Note <span className="text-faint font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Why this trade? Setup, conviction, plan…"
          className="w-full bg-surface3 border border-strong rounded-lg p-2 text-sm focus:outline-none focus:border-accent-blue resize-none"
        />
      </div>

      <div className="rounded-lg border border-subtle bg-surface3/50 px-3 py-2.5 text-xs space-y-1">
        {marginLoading ? (
          <span className="flex items-center gap-1.5 text-faint">
            <Loader2 size={12} className="animate-spin" /> Checking margin…
          </span>
        ) : margin ? (
          <>
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-faint">LTP</span>
              <span className="text-primary font-semibold">₹{margin.ltp}</span>
            </div>
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-faint">
                Max affordable qty ({margin.leverage}x)
              </span>
              <span className="text-accent-blue font-semibold">
                {margin.max_qty} shares
              </span>
            </div>
            {positionValue != null && (
              <div className="flex justify-between font-mono tabular-nums">
                <span className="text-faint">
                  Position value ({margin.leverage}x leverage)
                </span>
                <span className="text-primary font-semibold">
                  ₹{Math.round(positionValue).toLocaleString("en-IN")}
                </span>
              </div>
            )}
            {requiredMargin != null && (
              <div className="flex justify-between font-mono tabular-nums">
                <span className="text-faint">From your wallet</span>
                <span
                  className={
                    overBudget
                      ? "text-bear font-semibold"
                      : "text-primary font-semibold"
                  }
                >
                  ₹{requiredMargin.toLocaleString("en-IN")}
                  {walletPct != null ? ` (${walletPct.toFixed(1)}%)` : ""}
                </span>
              </div>
            )}
          </>
        ) : (
          <span className="text-faint">No live price yet for this symbol.</span>
        )}
      </div>

      {error && <p className="text-bear text-xs">{error}</p>}

      {showConfirm ? (
        <div className="rounded-lg border border-accent-blue/40 bg-accent-blue/5 px-3 py-3 space-y-2">
          <div className="text-[10px] font-bold text-accent-blue uppercase tracking-wider">
            Confirm order
          </div>
          <div className="text-xs space-y-1.5">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-faint">Side / Qty</span>
              <span className="font-semibold text-primary">
                {side} {quantity} {symbol}
              </span>
            </div>
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-faint">Order type</span>
              <span className="font-semibold text-primary">
                {orderType}
                {orderType === "LIMIT" ? ` @ ₹${limitPrice}` : ""}
              </span>
            </div>
            {positionValue != null && (
              <div className="flex justify-between font-mono tabular-nums">
                <span className="text-faint">
                  Position value ({margin.leverage}x leverage)
                </span>
                <span className="font-semibold text-primary">
                  ₹{Math.round(positionValue).toLocaleString("en-IN")}
                </span>
              </div>
            )}
            {requiredMargin != null && (
              <div className="flex justify-between font-mono tabular-nums">
                <span className="text-faint">From your wallet</span>
                <span className="font-semibold text-primary">
                  ₹{requiredMargin.toLocaleString("en-IN")}
                  {walletPct != null ? ` (${walletPct.toFixed(1)}%)` : ""}
                </span>
              </div>
            )}
            {(slPrice || targetPrice || tslType) && (
              <div className="flex justify-between font-mono tabular-nums">
                <span className="text-faint">SL / Target / Trail</span>
                <span className="font-semibold text-primary">
                  {slPrice ? `₹${slPrice}` : "—"} /{" "}
                  {targetPrice ? `₹${targetPrice}` : "—"} /{" "}
                  {tslType ? `${tslType} ${tslValue}` : "—"}
                </span>
              </div>
            )}
          </div>
          {highRisk && (
            <div className="flex items-start gap-1.5 rounded-md bg-accent-amber/10 border border-accent-amber/30 px-2 py-1.5 text-[11px] text-accent-amber">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              This order uses {walletPct.toFixed(0)}% of your available
              balance — a big move against you will hit hard.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={busy}
              className="rounded-lg py-2 text-sm font-bold border border-subtle text-muted hover:text-primary disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSubmit}
              disabled={busy}
              className="rounded-lg bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-90 disabled:opacity-50 py-2 text-sm font-bold text-white transition-opacity"
            >
              {busy ? "Placing…" : "Confirm"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={busy || overBudget || !margin?.ltp}
          className="w-full bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-90 disabled:opacity-50 rounded-lg py-2.5 text-sm font-bold text-white transition-opacity"
        >
          {`Review ${orderType} ${side}`}
        </button>
      )}
    </form>
  );
}
