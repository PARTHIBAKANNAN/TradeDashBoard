import React, { useMemo, useState } from "react";
import {
  LineChart,
  SlidersHorizontal,
  X,
  Building2,
  Star,
  Layers,
  Plus,
  Check,
} from "lucide-react";
import Card from "../components/ui/Card.jsx";
import CandleChart from "../components/CandleChart.jsx";
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

const CHART_HEIGHT = 360;

function ChartRow({ stock }) {
  const [ref, inView] = useInViewport();
  const wishlisted = useChartsWishlist().has(stock.symbol);

  return (
    <div
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
        <button
          onClick={() => chartsWishlistStore.toggle(stock.symbol)}
          title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors flex-shrink-0 ${
            wishlisted
              ? "border-accent-amber/40 bg-accent-amber/15 text-accent-amber"
              : "border-subtle bg-surface3 text-muted hover:text-accent-blue hover:border-accent-blue/40"
          }`}
        >
          {wishlisted ? <Check size={13} /> : <Plus size={13} />}
        </button>
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

export default function ChartsScreen({ stocks }) {
  const [showFilters, setShowFilters] = useState(true);
  const [strategy, setStrategy] = useState("all");
  const [selectedSector, setSelectedSector] = useState("All sectors");
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const wishlist = useChartsWishlist();

  const sectors = useMemo(() => {
    const set = new Set((stocks || []).map((s) => s.sector));
    return ["All sectors", ...Array.from(set).sort()];
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    return (stocks || [])
      .filter((s) => selectedSector === "All sectors" || s.sector === selectedSector)
      .filter((s) => !wishlistOnly || wishlist.has(s.symbol))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [stocks, selectedSector, wishlistOnly, wishlist]);

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
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 flex gap-6">
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
          <div className="flex items-center justify-between mb-4">
            {!showFilters ? (
              <button
                onClick={() => setShowFilters(true)}
                className="text-xs font-bold text-accent-blue hover:text-accent-violet transition-colors flex items-center gap-2"
              >
                <SlidersHorizontal size={13} />
                Show Filters
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-faint">
                <LineChart size={13} className="text-accent-blue" />
                Scroll through charts
              </div>
            )}
            <div className="text-xs text-faint ml-auto">
              Showing{" "}
              <span className="font-bold text-primary">
                {filteredStocks.length}
              </span>{" "}
              stocks
            </div>
          </div>

          <div className="space-y-4">
            {filteredStocks.map((stock) => (
              <ChartRow key={stock.symbol} stock={stock} />
            ))}
            {filteredStocks.length === 0 && (
              <div className="py-12 text-center text-faint text-sm">
                No stocks match the current filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
