"""
Pure mathematical engines described in the spec:

  A. Intraday Relative Strength (IRS) vs NIFTY 50
  B. 30-minute Opening Range Breakout (ORB) signal engine (C1-C4)
  C. Normalized dual-range coordinate mapper (0-100%)
  D. Day range position (%)

Every function here is deterministic and side-effect free so it can be unit
tested in isolation. `process_incoming_tick` is the one place that mutates the
shared state, and it delegates all arithmetic to these helpers.
"""

from datetime import datetime
from datetime import time as dt_time

from . import candle_aggregator, order_monitor
from .config import IST, ORB_CANDLES


# ---------- A. Intraday Relative Strength ----------
def intraday_relative_strength(stock_pct_change: float, index_pct_change: float) -> float:
    """IRS = %Δ stock − %Δ index (both vs previous close)."""
    return round(stock_pct_change - index_pct_change, 2)


def pct_change(ltp: float, prev_close: float) -> float:
    if not prev_close:
        return 0.0
    return round((ltp - prev_close) / prev_close * 100, 2)


# ---------- C. Normalized dual-range coordinate mapper ----------
def _x(price: float, g_min: float, g_max: float) -> float:
    denom = (g_max - g_min) or 1.0
    return round((price - g_min) / denom * 100, 2)


def range_map(y_low, y_high, t_low, t_high, ltp) -> dict:
    """
    Map yesterday's + today's ranges and the LTP onto a shared 0-100% scale.
    Returns coordinates plus the raw prices the UI labels the bar with.
    """
    g_min = min(y_low, t_low)
    g_max = max(y_high, t_high)
    return {
        "yesterday": {
            "low": _x(y_low, g_min, g_max),
            "high": _x(y_high, g_min, g_max),
            "raw_low": y_low,
            "raw_high": y_high,
        },
        "today": {
            "low": _x(t_low, g_min, g_max),
            "high": _x(t_high, g_min, g_max),
            "raw_low": t_low,
            "raw_high": t_high,
        },
        "ltp_pos": _x(ltp, g_min, g_max),
    }


# ---------- D. Day range position (%) ----------
def day_range_position(ltp: float, t_low: float, t_high: float) -> float:
    span = t_high - t_low
    if span <= 0:
        return 0.0
    return round((ltp - t_low) / span * 100, 2)


# ---------- E. Volume-weighted average price ----------
def update_vwap(
    cum_pv: float, cum_vol: int, prev_total_volume: int, new_total_volume: int, ltp: float
) -> tuple[float, int, float]:
    """
    Ticks carry *cumulative* today's volume (vol_traded_today), not the size of
    the individual trade, so VWAP needs the delta between this tick's total and
    the previous one. Returns (new_cum_pv, new_cum_vol, new_vwap).

    Guards against a non-monotonic volume tick (a stale/duplicate frame) by
    treating a decrease as a zero delta rather than corrupting the running sums.
    """
    delta = max(0, new_total_volume - prev_total_volume)
    if delta == 0:
        vwap = round(cum_pv / cum_vol, 4) if cum_vol else 0.0
        return cum_pv, cum_vol, vwap
    new_cum_pv = cum_pv + ltp * delta
    new_cum_vol = cum_vol + delta
    return new_cum_pv, new_cum_vol, round(new_cum_pv / new_cum_vol, 4)


# Re-export pure helpers from strategies for backwards compatibility
from .strategies.orb_strategy import (
    completed_candles,
    evaluate_orb,
    first_candle_extreme_intact,
    has_two_sided_range,
    OrbStrategy,
)
from .strategies.sector_sympathy_strategy import SectorSympathyStrategy
from .strategies.squeeze_strategy import SqueezeStrategy
from .strategies.vwap_retest_strategy import VWAPRetestStrategy
from .strategy_base import StrategyRegistry

# Default strategy registry (evaluated in registration priority order)
_strategy_registry = StrategyRegistry()
_strategy_registry.register(OrbStrategy())
_strategy_registry.register(VWAPRetestStrategy())
_strategy_registry.register(SectorSympathyStrategy())
_strategy_registry.register(SqueezeStrategy())


def get_default_strategy_registry() -> StrategyRegistry:
    """Return the global default StrategyRegistry."""
    return _strategy_registry


# ---------- Tick processor (the single mutation point) ----------
def process_incoming_tick(
    state,
    short_sym: str,
    ltp: float,
    high: float,
    low: float,
    prev_close: float = 0.0,
    volume: int = 0,
    upper_ckt: float = 0.0,
    lower_ckt: float = 0.0,
    tot_buy_qty: int = 0,
    tot_sell_qty: int = 0,
):
    """
    Update one stock's derived fields from a raw tick. `state` is the
    MarketState singleton; caller holds no lock — we take it here.

    `prev_close` lets the websocket feed supply the previous close (SymbolUpdate
    carries `prev_close_price`), so %change / RS / ranges work even when the REST
    backfill is unavailable (e.g. blocked by a corporate proxy).

    `volume` is today's cumulative traded quantity (SymbolUpdate's
    `vol_traded_today`), used for the treemap's traded-value sizing.

    `upper_ckt`/`lower_ckt` are the exchange circuit limits and `tot_buy_qty`/
    `tot_sell_qty` the aggregate outstanding order quantities — both carried
    directly on SymbolUpdate ticks, used by the circuit-proximity and
    buy/sell-pressure Insights widgets.
    """
    with state.lock():
        stock = state.get_stock(short_sym)
        if stock is None:
            return

        if prev_close and not stock["prev_close"]:
            stock["prev_close"] = prev_close
        stock["ltp"] = ltp
        if volume:
            stock["vwap_cum_pv"], stock["vwap_cum_vol"], stock["vwap"] = update_vwap(
                stock["vwap_cum_pv"], stock["vwap_cum_vol"], stock["volume"], volume, ltp
            )
            stock["volume"] = volume
        if upper_ckt:
            stock["upper_ckt"] = upper_ckt
        if lower_ckt:
            stock["lower_ckt"] = lower_ckt
        if tot_buy_qty:
            stock["tot_buy_qty"] = tot_buy_qty
        if tot_sell_qty:
            stock["tot_sell_qty"] = tot_sell_qty
        # Expand today's high and low from tick high/low or LTP fallback
        eff_high = max(high or 0, ltp)
        eff_low = min(low or ltp, ltp) if low else ltp
        stock["today_high"] = max(stock["today_high"] or eff_high, eff_high)
        stock["today_low"] = min(stock["today_low"] or eff_low, eff_low)

        stock["pct_change"] = pct_change(ltp, stock["prev_close"])
        stock["day_range_pos"] = day_range_position(ltp, stock["today_low"], stock["today_high"])
        stock["relative_strength"] = intraday_relative_strength(
            stock["pct_change"], state.nifty["pct_change"]
        )

        now_ist = datetime.now(IST)
        candle_aggregator.on_tick(stock, ltp, now_ist)

        # Capture the signal BEFORE evaluation so we can detect state transitions.
        prev_signal = stock.get("signal")
        all_stocks_list = list(state.stocks.values())

        # Evaluate all registered strategies (ORB, VWAP Retest, etc.) in priority order
        signal_event = _strategy_registry.evaluate_all(
            stock, now_ist, all_stocks=all_stocks_list
        )
        if signal_event is not None:
            signal = signal_event.label
            signal_time = signal_event.signal_time.strftime("%H:%M")
        else:
            signal, signal_time = None, None

        if signal:
            stock["signal"] = signal
            stock["signal_time"] = signal_time

            # ── Thread Flood Fix ──────────────────────────────────────────────
            # Only spawn an AI audit thread when the signal STATE CHANGES
            # (e.g. None → "Bull • C2" or "Bull • C2" → "Bear • C1").
            if signal != prev_signal:
                # ── PulseHunter V2 Dual-Score Evaluation ───────────────────────
                # Evaluates candidate on two distinct dimensions:
                # 1. Momentum Score (0-100): "Is this stock exhibiting elite momentum?" (Threshold: 70)
                # 2. Entry Quality Score (0-100): "Is this the right place/time to enter?" (Threshold: 70)
                from . import technical_indicators as _ti

                candle_closes = candle_aggregator.get_intraday_closes(short_sym)
                candle_volumes = candle_aggregator.get_intraday_volumes(short_sym)

                # Determine structural trigger level
                trigger_level = signal_event.trigger_price if signal_event else ltp

                # Compute Momentum Score
                mom_score, mom_factors, mom_metrics = _ti.rank_universe_momentum(
                    stock=stock,
                    signal=signal,
                    all_stocks=all_stocks_list,
                    candle_closes=candle_closes,
                    candle_volumes=candle_volumes,
                    depth_delta=stock.get("depth_delta", 0.0),
                )

                # Compute Entry Quality Score
                intraday_candles = candle_aggregator.get_intraday_candles(short_sym)
                atr_14 = _ti.compute_atr(intraday_candles, 14) if intraday_candles else 0.0
                vol_ratio = mom_metrics.get("vol_ratio", 1.0)
                eq_score, eq_factors, eq_metrics = _ti.calculate_entry_quality(
                    stock=stock,
                    signal=signal,
                    trigger_level=trigger_level,
                    trigger_time=now_ist,
                    day_high=stock.get("today_high"),
                    day_low=stock.get("today_low"),
                    atr_14=atr_14,
                    now=now_ist,
                    candles=intraday_candles,
                    volume_ratio=vol_ratio,
                )

                min_mom = getattr(_cfg, "MIN_MOMENTUM_SCORE", 70)
                min_eq = getattr(_cfg, "MIN_ENTRY_QUALITY_SCORE", 70)

                passes_eval = (mom_score >= min_mom) and (eq_score >= min_eq)

                import logging as _log

                logger = _log.getLogger(__name__)

                mom_summary = ", ".join(f"{f['name']}={f['pts']}/{f['max']}" for f in mom_factors)
                eq_summary = ", ".join(f"{f['name']}={f['pts']}/{f['max']}" for f in eq_factors)

                if passes_eval:
                    import threading

                    from . import ai_copilot

                    # Store scores on stock for AI context & UI inspection
                    stock["momentum_score"] = mom_score
                    stock["momentum_factors"] = mom_factors
                    stock["entry_quality_score"] = eq_score
                    stock["entry_quality_factors"] = eq_factors
                    stock["conviction_score"] = mom_score
                    stock["conviction_factors"] = mom_factors + eq_factors

                    # Check symbol-level lock before spawning thread
                    if ai_copilot.can_audit_symbol(short_sym, signal):
                        threading.Thread(
                            target=ai_copilot.audit_and_notify_signal,
                            args=(short_sym, signal, signal_time),
                            daemon=True,
                            name=f"ai-audit-{short_sym}",
                        ).start()

                        logger.info(
                            "[V2 EVAL] QUALIFIED %s | Signal: %s | Time: %s\n"
                            "  • MOMENTUM: %d/%d [%s]\n"
                            "  • ENTRY QUALITY: %d/%d [%s]\n"
                            "  → Spawning AI Red-Flag Audit",
                            short_sym, signal, signal_time,
                            mom_score, min_mom, mom_summary,
                            eq_score, min_eq, eq_summary,
                        )
                    else:
                        logger.info(
                            "[V2 EVAL] QUALIFIED %s (%d/%d, %d/%d) but symbol already audited today; skipping redundant thread",
                            short_sym, mom_score, min_mom, eq_score, min_eq,
                        )
                else:
                    rejection_reasons = []
                    if eq_score < 0:
                        rejection_reasons.append("Hard VWAP Veto")
                    else:
                        if mom_score < min_mom:
                            weak_mom = [f["name"] for f in mom_factors if f["pts"] < f["max"] * 0.4]
                            rejection_reasons.append(
                                f"Momentum {mom_score}/{min_mom} (weak: {', '.join(weak_mom[:2]) or 'drag'})"
                            )
                        if eq_score < min_eq:
                            weak_eq = [f["name"] for f in eq_factors if f["pts"] < f["max"] * 0.4]
                            rejection_reasons.append(
                                f"Entry Quality {eq_score}/{min_eq} (weak: {', '.join(weak_eq[:2]) or 'extended'})"
                            )

                    logger.info(
                        "[V2 EVAL] REJECTED %s | Signal: %s | Time: %s\n"
                        "  • MOMENTUM: %d/%d [%s]\n"
                        "  • ENTRY QUALITY: %d/%d [%s]\n"
                        "  • REASON: %s",
                        short_sym,
                        signal,
                        signal_time,
                        mom_score,
                        min_mom,
                        mom_summary,
                        eq_score,
                        min_eq,
                        eq_summary,
                        " | ".join(rejection_reasons),
                    )

    order_monitor.on_tick_threadsafe(short_sym, ltp)

