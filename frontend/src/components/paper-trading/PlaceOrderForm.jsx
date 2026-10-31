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
  const [showNotes, setShowNotes] = useState(false);
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

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const fetchAiAnalysis = async () => {
    if (!symbol) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
        credentials: "include",
      });
      const data = await res.json();
      setAiResult(data);
      if (data.suggested_sl) setSlPrice(String(data.suggested_sl));
      if (data.suggested_target) setTargetPrice(String(data.suggested_target));
      if (data.tsl_type) setTslType(data.tsl_type);
      if (data.tsl_value) setTslValue(String(data.tsl_value));
    } catch {
      setAiResult({
        decision: "ERROR",
        rationale: ["AI service temporary error."],
      });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2.5">
      {/* AI Copilot Widget - Compact Bar */}
      <div className="rounded-lg border border-accent-blue/30 bg-accent-blue/10 p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent-blue">
            <span>🤖 AI Copilot</span>
          </div>
          <button
            type="button"
            onClick={fetchAiAnalysis}
            disabled={aiLoading}
            className="px-2 py-0.5 rounded bg-accent-blue/20 hover:bg-accent-blue/30 border border-accent-blue/40 text-[10px] font-bold text-accent-blue transition-colors flex items-center gap-1"
          >
            {aiLoading ? <Loader2 size={10} className="animate-spin" /> : null}
            {aiLoading ? "Analyzing..." : "Audit & Auto-fill"}
          </button>
        </div>

        {aiResult && (
          <div className="space-y-1 pt-1 text-[11px] border-t border-accent-blue/20">
            <div className="flex items-center justify-between font-mono">
              <span className="text-muted">Decision:</span>
              <span
                className={`font-bold ${
                  aiResult.decision?.includes("BUY")
                    ? "text-bull"
                    : aiResult.decision?.includes("SELL")
                      ? "text-bear"
                      : "text-accent-amber"
                }`}
              >
                {aiResult.decision} ({aiResult.confidence_score}%)
              </span>
            </div>
            {aiResult.rationale && (
              <ul className="text-[10px] text-faint list-disc list-inside space-y-0.5">
                {aiResult.rationale.slice(0, 2).map((r, idx) => (
                  <li key={idx} className="truncate">
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Row 1: Symbol & Quantity */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1">
            Symbol
          </label>
          {lockSymbol ? (
            <div className="w-full bg-surface3 border border-subtle rounded-md px-2 py-1.5 text-xs font-bold text-primary truncate">
              {symbol}
            </div>
          ) : (
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-surface3 border border-strong rounded-md px-2 py-1.5 text-xs text-primary font-bold focus:outline-none focus:border-accent-blue"
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
          <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1">
            Quantity
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full bg-surface3 border border-strong rounded-md px-2 py-1.5 text-xs text-primary font-mono focus:outline-none focus:border-accent-blue"
          />
        </div>
      </div>

      {/* Row 2: Side & Order Type */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1">
            Side
          </label>
          <div className="grid grid-cols-2 gap-1">
            {SIDES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`flex items-center justify-center gap-1 rounded-md py-1 text-xs font-bold transition-colors border ${
                  side === s
                    ? s === "BUY"
                      ? "bg-bull/15 border-bull/40 text-bull"
                      : "bg-bear/15 border-bear/40 text-bear"
                    : "bg-surface3 border-subtle text-muted hover:text-primary"
                }`}
              >
                {s === "BUY" ? (
                  <ArrowUpCircle size={12} />
                ) : (
                  <ArrowDownCircle size={12} />
                )}
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1">
            Type
          </label>
          <div className="grid grid-cols-2 gap-1">
            {ORDER_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setOrderType(t)}
                className={`rounded-md py-1 text-xs font-semibold transition-colors border ${
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
      </div>

      {orderType === "LIMIT" && (
        <div>
          <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1">
            Limit Price (₹)
          </label>
          <input
            type="number"
            step="0.05"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder={margin?.ltp ? String(margin.ltp) : ""}
            className="w-full bg-surface3 border border-strong rounded-md px-2 py-1 text-xs text-primary font-mono focus:outline-none focus:border-accent-blue"
          />
        </div>
      )}

      {/* Row 3: Stop Loss & Target */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1">
            Stop Loss <span className="text-faint font-normal">(opt)</span>
          </label>
          <input
            type="number"
            step="0.05"
            value={slPrice}
            onChange={(e) => setSlPrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-surface3 border border-strong rounded-md px-2 py-1.5 text-xs text-primary font-mono focus:outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1">
            Target <span className="text-faint font-normal">(opt)</span>
          </label>
          <input
            type="number"
            step="0.05"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-surface3 border border-strong rounded-md px-2 py-1.5 text-xs text-primary font-mono focus:outline-none focus:border-accent-blue"
          />
        </div>
      </div>

      <TslFields
        tslType={tslType}
        tslValue={tslValue}
        onTypeChange={setTslType}
        onValueChange={setTslValue}
      />

      {/* Collapsible Journal Note Accordion */}
      <div>
        {!showNotes ? (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="text-[10px] text-accent-blue hover:underline font-medium flex items-center gap-1"
          >
            <span>+ Add Journal Note (optional)</span>
          </button>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-[9px] font-bold text-muted uppercase tracking-wider">
                Journal Note
              </label>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="text-[9px] text-faint hover:text-primary"
              >
                Hide
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              placeholder="Why this trade? Setup, plan..."
              className="w-full bg-surface3 border border-strong rounded-md px-2 py-1 text-xs text-primary focus:outline-none focus:border-accent-blue resize-none"
            />
          </div>
        )}
      </div>

      {/* Sizing & Margin Summary Strip */}
      <div className="rounded-md border border-subtle bg-surface3/50 px-2.5 py-1.5 text-[11px] space-y-0.5">
        {marginLoading ? (
          <span className="flex items-center gap-1 text-faint text-[10px]">
            <Loader2 size={10} className="animate-spin" /> Margin...
          </span>
        ) : margin ? (
          <>
            <div className="flex justify-between font-mono tabular-nums text-faint">
              <span>
                LTP: <strong className="text-primary">₹{margin.ltp}</strong>
              </span>
              <span>
                Max:{" "}
                <strong className="text-accent-blue">
                  {margin.max_qty} sh
                </strong>
              </span>
            </div>
            <div className="flex justify-between font-mono tabular-nums text-faint">
              <span>
                Val:{" "}
                <strong className="text-primary">
                  ₹{Math.round(positionValue || 0).toLocaleString("en-IN")}
                </strong>
              </span>
              <span>
                Margin:{" "}
                <strong className={overBudget ? "text-bear" : "text-primary"}>
                  ₹{requiredMargin?.toLocaleString("en-IN") || 0}
                  {walletPct != null ? ` (${walletPct.toFixed(0)}%)` : ""}
                </strong>
              </span>
            </div>
          </>
        ) : (
          <span className="text-faint text-[10px]">
            No live price yet for this symbol.
          </span>
        )}
      </div>

      {error && <p className="text-bear text-xs">{error}</p>}

      {/* Sticky Execution Footer */}
      <div className="pt-1">
        {showConfirm ? (
          <div className="rounded-lg border border-accent-blue/40 bg-accent-blue/5 p-2 space-y-1.5">
            <div className="text-[10px] font-bold text-accent-blue uppercase tracking-wider">
              Confirm {side} {quantity} {symbol}
            </div>
            <div className="flex justify-between font-mono text-[11px] tabular-nums">
              <span className="text-faint">Margin Required:</span>
              <span className="font-semibold text-primary">
                ₹{requiredMargin?.toLocaleString("en-IN")}
              </span>
            </div>
            {highRisk && (
              <div className="flex items-start gap-1 rounded bg-accent-amber/10 border border-accent-amber/30 p-1 text-[10px] text-accent-amber">
                <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                <span>Uses {walletPct.toFixed(0)}% of balance.</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={busy}
                className="rounded-md py-1 text-xs font-bold border border-subtle text-muted hover:text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSubmit}
                disabled={busy}
                className="rounded-md bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-90 py-1 text-xs font-bold text-white transition-opacity"
              >
                {busy ? "Placing…" : "Confirm"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            disabled={busy || overBudget || !margin?.ltp}
            className="w-full bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-90 disabled:opacity-50 rounded-lg py-2 text-xs font-bold text-white transition-opacity shadow-sm"
          >
            {`Review ${orderType} ${side}`}
          </button>
        )}
      </div>
    </form>
  );
}
