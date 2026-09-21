"""
Momentum and Entry Quality Scoring Engine.
Replaces binary hard gates with continuous scoring (0-100) across two dimensions:
1. Momentum Score: Is this stock exhibiting meaningful momentum?
2. Entry Quality Score: Is NOW a reasonable location to enter?
"""

import re

from . import candle_aggregator
from .config import INDUSTRY_GROUP

MOMENTUM_WEIGHTS = {
    "rs": 0.40,
    "volume_expansion": 0.30,
    "price_velocity": 0.20,
    "sector_alignment": 0.10,
}

ENTRY_QUALITY_WEIGHTS = {
    "freshness": 0.25,
    "vwap_extension": 0.25,
    "atr_consumed": 0.15,
    "price_acceleration": 0.15,
    "structure": 0.20,  # FVG and POC
}

FRESHNESS_BASE = {"C0.5": 100, "C1": 90, "C2": 70, "C3": 50, "C4": 30}
MOMENTUM_FLOOR = 65
ENTRY_QUALITY_FLOOR = 60
MAX_PICKS = 3

SECTOR_TO_NIFTY_GROUP = {
    "Energy": "NIFTY ENERGY",
    "Power": "NIFTY ENERGY",
    "Capital Goods": "NIFTY CAPITAL GOODS",
    "Consumer Durables": "NIFTY CONSR DURABLE",
    "Infra": "NIFTY INFRA",
    "Auto": "NIFTY AUTO",
    "Pvt Banks": "NIFTY BANK",
    "PSU Banks": "NIFTY PSU BANK",
    "NBFC": "NIFTY FINSERV",
    "Insurance": "NIFTY FINSERV",
    "Capital Markets": "NIFTY FINSERV",
    "Healthcare": "NIFTY HEALTHCARE",
    "Realty": "NIFTY REALTY",
    "IT": "NIFTY IT",
    "Pharma": "NIFTY PHARMA",
    "Chemicals": "NIFTY CHEMICALS",
    "Consumer": "NIFTY CONSUMPTION",
    "FMCG": "NIFTY FMCG",
    "Cement": "NIFTY CEMENT",
    "Metals": "NIFTY METAL",
}


def nifty_group(sector: str | None) -> str:
    return SECTOR_TO_NIFTY_GROUP.get(sector, sector or "")


def industry_group(symbol: str | None) -> str:
    if not symbol:
        return ""
    clean_sym = symbol.replace("NSE:", "").replace("-EQ", "").strip()
    return INDUSTRY_GROUP.get(clean_sym, INDUSTRY_GROUP.get(symbol, ""))


def _clamp(n: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, n))


def _signal_candle(signal: str | None) -> str | None:
    if not signal:
        return None
    if "C0.5" in signal:
        return "C0.5"
    match = re.search(r"C(\d)", signal)
    return f"C{match.group(1)}" if match else None


def build_sector_means(stocks: list[dict]) -> dict[str, float]:
    groups: dict[str, list[float]] = {}
    for s in stocks:
        group = nifty_group(industry_group(s.get("symbol")))
        groups.setdefault(group, []).append(s.get("pct_change") or 0.0)
    return {group: sum(vals) / len(vals) for group, vals in groups.items() if vals}


def evaluate_scores(
    stock: dict, all_stocks: list[dict], nifty_pct_change: float, sector_means: dict[str, float]
) -> dict:
    signal = stock.get("signal")
    if not signal or signal == "None":
        return {"momentum": 0.0, "entry_quality": 0.0, "components": {}}

    is_bull = "Bull" in signal
    sym = stock["symbol"]
    ltp = stock.get("ltp") or 0.0

    # 1. Momentum Component: Relative Strength
    rs_raw = stock.get("relative_strength") or 0.0
    rs_raw = rs_raw if is_bull else -rs_raw
    rs_score = _clamp(rs_raw * 10, 0, 100)

    # 2. Momentum Component: Sector Alignment (Soft penalty if fighting sector, bonus if aligned)
    group = nifty_group(industry_group(sym))
    sector_mean_pct = sector_means.get(group, 0.0)
    pct_change = stock.get("pct_change") or 0.0
    sector_rs = (pct_change - sector_mean_pct) if is_bull else (sector_mean_pct - pct_change)
    sector_score = _clamp(50 + (sector_rs * 10), 0, 100)  # 50 is neutral

    # Analyze Intraday Candles for Volume/Velocity/Acceleration
    candles = candle_aggregator.get_intraday_candles(sym)
    vol_exp_score = 50.0
    velocity_score = 50.0
    acceleration_score = 50.0
    atr_consumed_score = 50.0

    if len(candles) >= 3:
        # Volume Expansion: Compare last 1-2 candles vs average of previous
        recent_vol = sum(c.get("volume", 0) for c in candles[-2:]) / 2.0
        base_vol = sum(c.get("volume", 0) for c in candles[:-2]) / max(1, len(candles) - 2)
        if base_vol > 0:
            vol_ratio = recent_vol / base_vol
            vol_exp_score = _clamp((vol_ratio - 1.0) * 50, 0, 100)

        # Price Velocity: Rate of change over last 3 candles
        past_price = candles[-3]["close"]
        if past_price > 0:
            velocity_pct = ((ltp - past_price) / past_price) * 100.0
            velocity = velocity_pct if is_bull else -velocity_pct
            velocity_score = _clamp(velocity * 100, 0, 100)  # e.g., 0.5% move = 50 score

        # Price Acceleration: Rate of change of velocity (is the move speeding up or exhausting?)
        if len(candles) >= 5:
            older_price = candles[-5]["close"]
            old_velocity_pct = ((past_price - older_price) / older_price) * 100.0
            old_velocity = old_velocity_pct if is_bull else -old_velocity_pct
            accel = velocity - old_velocity
            acceleration_score = _clamp(50 + (accel * 100), 0, 100)

        # ATR Consumed
        highs = [c["high"] for c in candles]
        lows = [c["low"] for c in candles]
        day_range = max(highs) - min(lows)
        recent_range = max(c["high"] for c in candles[-3:]) - min(c["low"] for c in candles[-3:])
        if day_range > 0:
            consumed = recent_range / day_range
            # Less ATR consumed recently means more room to run (better entry quality)
            atr_consumed_score = _clamp((1.0 - consumed) * 100, 0, 100)

    momentum = (
        rs_score * MOMENTUM_WEIGHTS["rs"]
        + vol_exp_score * MOMENTUM_WEIGHTS["volume_expansion"]
        + velocity_score * MOMENTUM_WEIGHTS["price_velocity"]
        + sector_score * MOMENTUM_WEIGHTS["sector_alignment"]
    )

    # Structure (FVG/POC)
    fvg_present = False
    structure_score = 50.0
    if len(candles) >= 3:
        # FVG Detection (last 3 completed candles)
        if is_bull:
            # Bullish FVG: Low of candle 3 > High of candle 1
            if candles[-1]["low"] > candles[-3]["high"]:
                fvg_present = True
                structure_score += 25.0
        else:
            # Bearish FVG: High of candle 3 < Low of candle 1
            if candles[-1]["high"] < candles[-3]["low"]:
                fvg_present = True
                structure_score += 25.0

        # POC (Point of Control) - lightweight 20-bin profile
        c_highs = [c["high"] for c in candles]
        c_lows = [c["low"] for c in candles]
        day_h, day_l = max(c_highs), min(c_lows)
        if day_h > day_l:
            bin_size = (day_h - day_l) / 20.0
            bins = [0.0] * 20
            for c in candles:
                c_vol = c.get("volume", 0)
                # distribute volume evenly across bins spanned by candle
                start_bin = int((c["low"] - day_l) / bin_size)
                end_bin = int((c["high"] - day_l) / bin_size)
                start_bin = _clamp(start_bin, 0, 19)
                end_bin = _clamp(end_bin, 0, 19)
                span = end_bin - start_bin + 1
                for b in range(start_bin, end_bin + 1):
                    bins[b] += c_vol / span

            poc_bin_idx = bins.index(max(bins))
            poc_price = day_l + (poc_bin_idx * bin_size) + (bin_size / 2)

            # If price is above POC for longs, or below POC for shorts, it's good structure.
            if is_bull and ltp >= poc_price:
                structure_score += 25.0
            elif not is_bull and ltp <= poc_price:
                structure_score += 25.0

    structure_score = _clamp(structure_score, 0, 100)

    # 3. Entry Quality Component: Freshness
    freshness_base = FRESHNESS_BASE.get(_signal_candle(signal), 0)
    # Decay freshness based on time since signal or extension
    freshness_score = freshness_base

    # 4. Entry Quality Component: VWAP Extension
    vwap = stock.get("vwap") or ltp
    if vwap > 0:
        ext_pct = ((ltp - vwap) / vwap) * 100.0
        ext = ext_pct if is_bull else -ext_pct
        # Mild extension is good (momentum), extreme extension is bad (exhaustion).
        # We penalize extensions > 1.0% heavily for entry quality.
        if ext < 0:
            vwap_ext_score = 50.0  # Behind VWAP (Pullback context, acceptable)
        elif ext < 0.5:
            vwap_ext_score = 100.0  # Perfect breakout location
        else:
            vwap_ext_score = _clamp(100.0 - ((ext - 0.5) * 100), 0, 100)
    else:
        vwap_ext_score = 50.0

    entry_quality = (
        freshness_score * ENTRY_QUALITY_WEIGHTS["freshness"]
        + vwap_ext_score * ENTRY_QUALITY_WEIGHTS["vwap_extension"]
        + atr_consumed_score * ENTRY_QUALITY_WEIGHTS["atr_consumed"]
        + acceleration_score * ENTRY_QUALITY_WEIGHTS["price_acceleration"]
        + structure_score * ENTRY_QUALITY_WEIGHTS["structure"]
    )

    # Contextual Index Alignment
    aligned_with_nifty = nifty_pct_change >= 0 if is_bull else nifty_pct_change <= 0
    if not aligned_with_nifty:
        # Soft penalty instead of hard gate
        momentum *= 0.7
        entry_quality *= 0.8

    return {
        "momentum": round(momentum, 2),
        "entry_quality": round(entry_quality, 2),
        "components": {
            "rs": round(rs_score, 1),
            "vol_exp": round(vol_exp_score, 1),
            "velocity": round(velocity_score, 1),
            "sector": round(sector_score, 1),
            "freshness": round(freshness_score, 1),
            "vwap_ext": round(vwap_ext_score, 1),
            "atr_consumed": round(atr_consumed_score, 1),
            "acceleration": round(acceleration_score, 1),
            "structure": round(structure_score, 1),
        },
        "context": {"fvg_present": fvg_present},
    }


def compute_recommended(stocks: list[dict], nifty_pct_change: float) -> list[tuple[str, float]]:
    """Top MAX_PICKS stocks scoring >= MOMENTUM_FLOOR and ENTRY_QUALITY >= ENTRY_QUALITY_FLOOR."""
    sector_means = build_sector_means(stocks)
    qualifying = []

    for s in stocks:
        scores = evaluate_scores(s, stocks, nifty_pct_change, sector_means)
        s["scores"] = scores  # attach to stock for AI copilot to read
        if scores["momentum"] >= MOMENTUM_FLOOR and scores["entry_quality"] >= ENTRY_QUALITY_FLOOR:
            qualifying.append((s["symbol"], scores["momentum"]))

    qualifying.sort(key=lambda pair: pair[1], reverse=True)
    return qualifying[:MAX_PICKS]
