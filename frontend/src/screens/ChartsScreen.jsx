import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  SlidersHorizontal,
  X,
  Building2,
  Star,
  Layers,
  Plus,
  Check,
  Search,
  Rocket,
  Maximize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Card from "../components/ui/Card.jsx";
import CandleChart from "../components/CandleChart.jsx";
import ChartModal from "../components/ChartModal.jsx";
import QuickTradeModal from "../components/paper-trading/QuickTradeModal.jsx";
import { useInViewport } from "../hooks/useInViewport.js";
import { usePositions } from "../hooks/useOrders.js";
import { useSymbolCandles } from "../hooks/useSymbolCandles.js";
import {
  chartsWishlistStore,
  useChartsWishlist,
} from "../store/chartsWishlistStore.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" for `n` calendar days ago (0 = today). */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Today's ISO date string. */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function FilterGroup({ label, icon: Icon, children }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase mb-2 tracking-wide">
        {Icon && <Icon size={12} className="text-accent-blue" />}
        {label}
      </label>
      {children}
    </div>
  );
}

const CHART_HEIGHT = 320;

// ── ChartRow ──────────────────────────────────────────────────────────────────

function ChartRow({ stock, onExpand }) {
  const [ref, inView] = useInViewport();
  const wishlisted = useChartsWishlist().has(stock.symbol);
  const [tradeOpen, setTradeOpen] = useState(false);
  // "today" or "YYYY-MM-DD" for historical navigation.
  const [viewDate, setViewDate] = useState("today");
  const isToday = viewDate === "today";

  const goBack = useCallback(() => {
    const base = isToday ? todayStr() : viewDate;
    // Step back 1 calendar day; the backend will serve whatever's in DB for
    // that date (skipping weekends automatically — it just returns empty if
    // no data exists for that date, which we handle in ChartRowBody).
    const prev = daysAgo(
      Math.max(1, Math.round((Date.now() - new Date(base).getTime()) / 86400000) + 1),
    );
    setViewDate(prev);
  }, [isToday, viewDate]);

  const goToToday = useCallback(() => setViewDate("today"), []);

  // ₹ point change
  const pointChange =
    stock.ltp != null && stock.prev_close != null
      ? stock.ltp - stock.prev_close
      : null;

  return (
    <div
      id={`chart-row-${stock.symbol}`}
      ref={ref}
      className="rounded-xl border border-subtle bg-surface2/70 backdrop-blur-xl shadow-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-subtle">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-primary">{stock.symbol}</span>
            <span className="font-mono text-xs font-semibold text-primary">
              {stock.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
            {pointChange != null && (
              <span
                className={`font-mono text-xs font-semibold ${
                  pointChange >= 0 ? "text-bull" : "text-bear"
                }`}
              >
                {pointChange >= 0 ? "▲" : "▼"}{" "}
                {Math.abs(pointChange).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </span>
            )}
            <span
              className={`text-xs font-mono font-semibold ${
                stock.pct_change >= 0 ? "text-bull" : "text-bear"
              }`}
            >
              ({stock.pct_change >= 0 ? "+" : ""}
              {stock.pct_change}%)
            </span>
          </div>
          <div className="text-[11px] text-faint truncate">{stock.sector}</div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* ◀ Prev / Today ▶ navigation */}
          <button
            onClick={goBack}
            title="Previous day"
            className="w-7 h-7 grid place-items-center rounded-lg border border-subtle bg-surface3 text-muted hover:text-accent-blue hover:border-accent-blue/40 transition-colors"
          >
            <ChevronLeft size={13} />
          </button>
          {!isToday && (
            <button
              onClick={goToToday}
              title="Back to today"
              className="px-2 py-1 text-[10px] font-bold rounded-lg border border-accent-blue/40 bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors"
            >
              Today
            </button>
          )}

          {/* Expand to modal */}
          <button
            onClick={() => onExpand(stock.symbol)}
            title="Open full-screen chart"
            className="w-7 h-7 grid place-items-center rounded-lg border border-subtle bg-surface3 text-muted hover:text-accent-blue hover:border-accent-blue/40 transition-colors"
          >
            <Maximize2 size={13} />
          </button>

          <button
            onClick={() => setTradeOpen(true)}
            title="Paper trade this stock"
            className="inline-flex items-center gap-1 rounded-lg border border-subtle bg-surface3 px-2.5 py-1.5 text-[11px] font-bold text-muted hover:text-accent-blue hover:border-accent-blue/40 transition-colors"
          >
            <Rocket size={13} /> Trade
          </button>
          <button
            onClick={() => chartsWishlistStore.toggle(stock.symbol)}
            title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
              wishlisted
                ? "border-accent-amber/40 bg-accent-amber/15 text-accent-amber"
                : "border-subtle bg-surface3 text-muted hover:text-accent-blue hover:border-accent-blue/40"
            }`}
          >
            {wishlisted ? <Check size={13} /> : <Plus size={13} />}
          </button>
        </div>

        {tradeOpen && (
          <QuickTradeModal
            symbol={stock.symbol}
            onClose={() => setTradeOpen(false)}
          />
        )}
      </div>

      {inView ? (
        <ChartRowBody symbol={stock.symbol} viewDate={viewDate} />
      ) : (
        <div
          style={{ height: CHART_HEIGHT }}
          className="grid place-items-center text-faint text-xs"
        >
          Scroll to load chart…
        </div>
      )}
    </div>
  );
}

// ── ChartRowBody ──────────────────────────────────────────────────────────────

function ChartRowBody({ symbol, viewDate }) {
  const { candles, levels, loading, isPreviousDay, candleDate } =
    useSymbolCandles(symbol, viewDate);
  const positions = usePositions();
  const position = positions.find(
    (p) => p.symbol === symbol && p.status === "OPEN",
  );

  if (loading && candles.length === 0) {
    return (
      <div
        style={{ height: CHART_HEIGHT }}
        className="grid place-items-center text-faint text-xs animate-pulse"
      >
        Loading candles…
      </div>
    );
  }
  if (!loading && candles.length === 0) {
    return (
      <div
        style={{ height: CHART_HEIGHT }}
        className="grid place-items-center text-faint text-xs"
      >
        No candle data available for this date.
      </div>
    );
  }
  return (
    <CandleChart
      candles={candles}
      levels={levels}
      position={position}
      height={CHART_HEIGHT}
      multiDay={false}
      candleDate={candleDate}
      isPreviousDay={isPreviousDay}
    />
  );
}

// ── ChartsScreen ──────────────────────────────────────────────────────────────

export default function ChartsScreen({ stocks, focusSymbol, onFocusHandled }) {
  const [showFilters, setShowFilters] = useState(false);
  const [strategy, setStrategy] = useState("all");
  const [selectedSector, setSelectedSector] = useState("All sectors");
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [search, setSearch] = useState("");
  const wishlist = useChartsWishlist();
  const [expandedSymbol, setExpandedSymbol] = useState(null);

  const sectors = useMemo(() => {
    const set = new Set((stocks || []).map((s) => s.sector));
    return ["All sectors", ...Array.from(set).sort()];
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    return (stocks || [])
      .filter(
        (s) => selectedSector === "All sectors" || s.sector === selectedSector,
      )
      .filter((s) => !wishlistOnly || wishlist.has(s.symbol))
      .filter(
        (s) => !search || s.symbol.toUpperCase().includes(search.toUpperCase()),
      )
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [stocks, selectedSector, wishlistOnly, wishlist, search]);

  useEffect(() => {
    if (!focusSymbol) return;
    setSelectedSector("All sectors");
    setWishlistOnly(false);
    setSearch("");
    const timer = setTimeout(() => {
      document
        .getElementById(`chart-row-${focusSymbol}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      onFocusHandled?.();
    }, 60);
    return () => clearTimeout(timer);
  }, [focusSymbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close modal on Escape key.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setExpandedSymbol(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filterCard = (
    <Card
      title="Filters"
      icon={SlidersHorizontal}
      actions={
        <button
          onClick={() => setShowFilters(false)}
          className="text-faint hover:text-primary transition-colors"
        >
          <X size={15} />
        </button>
      }
    >
      <div className="space-y-5">
        <FilterGroup label="Strategy" icon={Layers}>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            disabled
            className="w-full bg-surface3 border border-strong rounded-lg px-3 py-2 text-sm text-faint cursor-not-allowed"
          >
            <option value="all">All strategies (coming soon)</option>
          </select>
        </FilterGroup>

        <FilterGroup label="Sector" icon={Building2}>
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="w-full bg-surface3 border border-strong rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent-blue transition-colors"
          >
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup label="Wishlist" icon={Star}>
          <select
            value={wishlistOnly ? "wishlist" : "all"}
            onChange={(e) => setWishlistOnly(e.target.value === "wishlist")}
            className="w-full bg-surface3 border border-strong rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent-blue transition-colors"
          >
            <option value="all">All stocks</option>
            <option value="wishlist">Wishlist only</option>
          </select>
        </FilterGroup>
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Full-screen modal */}
      {expandedSymbol && (
        <ChartModal
          symbol={expandedSymbol}
          stock={stocks?.find((s) => s.symbol === expandedSymbol)}
          onClose={() => setExpandedSymbol(null)}
        />
      )}

      <div className="mx-auto max-w-[1920px] w-full px-4 sm:px-6 py-4 flex gap-6">
        {showFilters && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
              onClick={() => setShowFilters(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto p-4 lg:hidden">
              {filterCard}
            </div>
            <div className="hidden lg:block w-72 flex-shrink-0">
              <div className="sticky top-24">{filterCard}</div>
            </div>
          </>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            {!showFilters ? (
              <button
                onClick={() => setShowFilters(true)}
                className="text-xs font-bold text-accent-blue hover:text-accent-violet transition-colors flex items-center gap-2 flex-shrink-0"
              >
                <SlidersHorizontal size={13} />
                Show Filters
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-faint flex-shrink-0">
                <LineChart size={13} className="text-accent-blue" />
                Scroll through charts
              </div>
            )}
            <div className="relative w-full max-w-[220px] ml-auto">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search symbol…"
                className="w-full bg-surface3 border border-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-primary focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>
            <div className="text-xs text-faint flex-shrink-0">
              Showing{" "}
              <span className="font-bold text-primary">
                {filteredStocks.length}
              </span>{" "}
              stocks
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredStocks.map((stock) => (
              <ChartRow
                key={stock.symbol}
                stock={stock}
                onExpand={setExpandedSymbol}
              />
            ))}
            {filteredStocks.length === 0 && (
              <div className="col-span-full py-12 text-center text-faint text-sm">
                No stocks match the current filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
