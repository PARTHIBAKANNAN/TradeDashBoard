import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpCircle, ArrowDownCircle, Loader2 } from "lucide-react";
import { fetchMargin, placeOrder } from "../../hooks/useOrders.js";
import TslFields from "./TslFields.jsx";

const SIDES = ["BUY", "SELL"];
const ORDER_TYPES = ["MARKET", "LIMIT"];

// Order-ticket form: symbol + side + order type + qty + optional bracket
// SL/Target. Recomputes the live "how many shares can I afford" figure from
// /api/paper/margin as symbol/qty change, mirroring a real broker's ticket.
export default function PlaceOrderForm({ stocks, defaultSymbol, lockSymbol = false, onPlaced }) {
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
  const [margin, setMargin] = useState(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  const requiredMargin =
    margin && margin.ltp
      ? Math.round(
          ((orderType === "LIMIT" && limitPrice ? Number(limitPrice) : margin.ltp) *
            (Number(quantity) || 0)) /
            margin.leverage,
        )
      : null;
  const overBudget = requiredMargin != null && margin && requiredMargin > margin.available_balance;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!symbol) return;
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setError("Quantity must be a positive whole number.");
      return;
    }
    if (orderType === "LIMIT" && (!limitPrice || Number(limitPrice) <= 0)) {
      setError("Limit price is required for a LIMIT order.");
      return;
    }
    if (tslType && (!tslValue || Number(tslValue) <= 0)) {
      setError("Trailing stop value is required when a trail type is selected.");
      return;
    }
    setBusy(true);
    try {
      await placeOrder({
        symbol,
        side,
        quantity: qty,
        order_type: orderType,
        limit_price: orderType === "LIMIT" ? Number(limitPrice) : undefined,
        sl_price: slPrice ? Number(slPrice) : undefined,
        target_price: targetPrice ? Number(targetPrice) : undefined,
        tsl_type: tslType || undefined,
        tsl_value: tslType && tslValue ? Number(tslValue) : undefined,
      });
      setSlPrice("");
      setTargetPrice("");
      setTslType("");
      setTslValue("");
      if (orderType === "LIMIT") setLimitPrice("");
      onPlaced?.();
    } catch (err) {
      setError(err.message || "Order rejected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
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
            {s === "BUY" ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
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

      <div className="grid grid-cols-2 gap-3">
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
              <span className="text-faint">Max affordable qty ({margin.leverage}x)</span>
              <span className="text-accent-blue font-semibold">{margin.max_qty} shares</span>
            </div>
            {requiredMargin != null && (
              <div className="flex justify-between font-mono tabular-nums">
                <span className="text-faint">Margin required</span>
                <span className={overBudget ? "text-bear font-semibold" : "text-primary font-semibold"}>
                  ₹{requiredMargin.toLocaleString("en-IN")}
                </span>
              </div>
            )}
          </>
        ) : (
          <span className="text-faint">No live price yet for this symbol.</span>
        )}
      </div>

      {error && <p className="text-bear text-xs">{error}</p>}

      <button
        type="submit"
        disabled={busy || overBudget || !margin?.ltp}
        className="w-full bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-90 disabled:opacity-50 rounded-lg py-2.5 text-sm font-bold text-white transition-opacity"
      >
        {busy ? "Placing…" : `Place ${orderType} ${side}`}
      </button>
    </form>
  );
}
