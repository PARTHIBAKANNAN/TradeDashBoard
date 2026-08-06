import React, { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import Card from "../components/ui/Card.jsx";
import CandleChart from "../components/CandleChart.jsx";
import QuickTradeModal from "../components/paper-trading/QuickTradeModal.jsx";
import { useInViewport } from "../hooks/useInViewport.js";
import { useSymbolCandles } from "../hooks/useSymbolCandles.js";
import {
  chartsWishlistStore,
  useChartsWishlist,
} from "../store/chartsWishlistStore.js";

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

function ChartRow({ stock }) {
  const [ref, inView] = useInViewport();
  const wishlisted = useChartsWishlist().has(stock.symbol);
  const [tradeOpen, setTradeOpen] = useState(false);

  return (
    <div
      id={`chart-row-${stock.symbol}`}
      ref={ref}
      className="rounded-xl border border-subtle bg-surface2/70 backdrop-blur-xl shadow-card overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-subtle">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-primary">{stock.symbol}</span>
            <span
              className={`text-xs font-mono font-semibold ${
                stock.pct_change >= 0 ? "text-bull" : "text-bear"
              }`}
            >
              {stock.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}{" "}
              ({stock.pct_change >= 0 ? "+" : ""}
              {stock.pct_change}%)
            </span>
          </div>
          <div className="text-[11px] text-faint truncate">{stock.sector}</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
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
          <QuickTradeModal symbol={stock.symbol} onClose={() => setTradeOpen(false)} />
        )}
      </div>

      {inView ? (
        <ChartRowBody symbol={stock.symbol} />
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

function ChartRowBody({ symbol }) {
  const { candles, levels, loading } = useSymbolCandles(symbol);

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
        No candles yet today
      </div>
    );
  }
  return <CandleChart candles={candles} levels={levels} height={CHART_HEIGHT} />;
}

export default function ChartsScreen({ stocks, focusSymbol, onFocusHandled }) {
  const [showFilters, setShowFilters] = useState(true);
  const [strategy, setStrategy] = useState("all");
  const [selectedSector, setSelectedSector] = useState("All sectors");
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [search, setSearch] = useState("");
  const wishlist = useChartsWishlist();

  const sectors = useMemo(() => {
    const set = new Set((stocks || []).map((s) => s.sector));
    return ["All sectors", ...Array.from(set).sort()];
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    return (stocks || [])
      .filter((s) => selectedSector === "All sectors" || s.sector === selectedSector)
      .filter((s) => !wishlistOnly || wishlist.has(s.symbol))
      .filter((s) => !search || s.symbol.toUpperCase().includes(search.toUpperCase()))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [stocks, selectedSector, wishlistOnly, wishlist, search]);

  // Jumping here from Ranking/Watchlist ("open in Charts") should always
  // reveal the target stock even if a stale filter would otherwise hide it.
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 flex gap-6">
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
              <ChartRow key={stock.symbol} stock={stock} />
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
