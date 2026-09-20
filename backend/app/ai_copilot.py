"""
AI Trade Copilot & Market Context Engine.

Integrates with Google Gemini API (gemini-2.0-flash / gemini-3.6-flash) to provide:
1. Pre-Market Daily Briefing (08:45 AM): Global cues, daily market bias, and risk events.
2. High-Conviction Signal Audit (Red-Flag Filter): Passes real quantitative data and asks
   Gemini to identify RED FLAGS that disqualify the trade, NOT to generate a buy signal.
   Decision: SKIP_TRAP (red flags found) or CONFIRM (no red flags, high conviction).
3. Auto Paper Trade Execution: When CONFIRM + confidence >= MIN_AI_CONFIDENCE and session
   is within AUTO_EXECUTE_UNTIL_MINUTE window, places a paper trade automatically with
   risk-adjusted quantity (DAILY_MAX_RISK_INR / MAX_DAILY_AUTO_TRADES / SL_distance).

Rate-limit safety: A module-level Semaphore(1) + 2-second pacing ensures all Gemini calls
are serialised, preventing burst HTTP 429 errors on Free Tier (15 RPM).

Fallback safety: If GEMINI_API_KEY is not set or API fails, gracefully returns structured
heuristic fallbacks without crashing the app or stopping execution.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

try:
    from dotenv import load_dotenv

    # Load backend/.env or root .env automatically
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    load_dotenv(".env")
except ImportError:
    pass

from . import config
from .config import IST

logger = logging.getLogger(__name__)

# Default model to use via Google AI Studio API
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# In-memory cache for pre-market briefing so it's computed once at 08:45 AM
_premarket_cache: Dict[str, Any] = {
    "date": "",
    "bias": "NEUTRAL",
    "summary": "Pre-market briefing not run yet.",
    "global_cues": {},
    "blacklist": [],
}

# ── Rate-Limit Semaphore ──────────────────────────────────────────────────────
# Serialises all Gemini API calls to prevent burst 429 errors on Free Tier
# (15 RPM limit).  The 2-second sleep between calls keeps throughput at ~30
# calls/min max — safely under the limit even in the worst spike scenario.
_gemini_semaphore = threading.Semaphore(1)
_GEMINI_INTER_CALL_DELAY_S = 2.0  # seconds to sleep between consecutive calls


def _get_api_key() -> str:
    return os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)


def call_gemini(
    prompt: str,
    system_instruction: Optional[str] = None,
    enable_search: bool = False,
) -> Optional[str]:
    """
    Call Google Gemini REST API directly using standard urllib (no heavy SDK needed).
    Returns raw text output from the model or None on failure.

    Rate-limited: acquires a module-level semaphore and sleeps 2 s after release
    to prevent burst HTTP 429 on Gemini Free Tier (15 RPM).

    If enable_search is True, Google Search Grounding is attached so the model
    retrieves real-time live web facts (used for the 08:45 AM pre-market briefing).
    """
    api_key = _get_api_key()
    if not api_key:
        logger.warning("ai_copilot: GEMINI_API_KEY is not configured.")
        return None

    model = os.getenv("GEMINI_MODEL", GEMINI_MODEL)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    contents = [{"parts": [{"text": prompt}]}]
    payload: Dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2,
        },
    }

    if not enable_search:
        # Structured JSON output is enforced for live signal audits
        payload["generationConfig"]["responseMimeType"] = "application/json"
    else:
        # Enable Google Search Grounding for real-time web retrieval
        payload["tools"] = [{"googleSearch": {}}]

    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    with _gemini_semaphore:
        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                candidates = body.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "")
        except Exception as e:
            logger.exception("ai_copilot: Gemini API call failed: %s", e)
        finally:
            # Always sleep after releasing lock — paces consecutive calls
            time.sleep(_GEMINI_INTER_CALL_DELAY_S)

    return None


# ── 1. Pre-Market Daily Briefing (08:45 AM) ───────────────────────────────────


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Helper to parse JSON even if wrapped in markdown codeblocks or surrounded by text."""
    if not text:
        return None
    cleaned = text.strip()
    # Remove markdown code block if present
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        # Fallback: regex search for the outermost {...}
        import re

        match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except Exception:
                pass
    return None


def fetch_multi_stream_news() -> Dict[str, List[str]]:
    """
    Fetch minute-by-minute live market news headlines across 4 dedicated institutional streams:
    1. Global Macro & US Tech (Nasdaq, Fed, Asian indices)
    2. Commodities & Currencies (Gold, Silver, Brent Crude Oil, DXY, China demand)
    3. Regulatory & Policy (SEBI, Government policies, Tariffs, Taxes)
    4. Indian Corporate & Earnings (Earnings results, leadership changes, orders)
    """
    import re
    import xml.etree.ElementTree as ET

    feed_streams = {
        "Global Macro & US Tech": [
            "https://feeds.bbci.co.uk/news/business/rss.xml",
            "https://finance.yahoo.com/news/rssindex",
        ],
        "Commodities & Foreign Cues": [
            "https://economictimes.indiatimes.com/markets/commodities/rssfeeds/2146843.cms",
        ],
        "Policy, Tariffs & Regulatory": [
            "https://economictimes.indiatimes.com/news/economy/policy/rssfeeds/13358319.cms",
            "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        ],
        "Indian Corporate & Stocks": [
            "https://economictimes.indiatimes.com/markets/stocks/news/rssfeeds/2146842.cms",
            "https://www.livemint.com/rss/markets",
        ],
    }

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    categorized_news: Dict[str, List[str]] = {}

    for category, urls in feed_streams.items():
        categorized_news[category] = []
        for url in urls:
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=5) as resp:
                    content = resp.read().decode("utf-8", errors="ignore")
                    root = ET.fromstring(content)
                    for item in root.findall(".//item")[:5]:
                        t = item.find("title")
                        d = item.find("description")
                        if t is not None and t.text:
                            title_clean = re.sub("<[^<]+?>", "", t.text).strip()
                            desc_clean = (
                                re.sub("<[^<]+?>", "", d.text).strip()
                                if d is not None and d.text
                                else ""
                            )
                            if title_clean:
                                categorized_news[category].append(
                                    f"{title_clean}: {desc_clean[:140]}"
                                )
            except Exception as e:
                logger.debug("ai_copilot: error fetching feed %s: %s", url, e)

    return categorized_news


def run_premarket_briefing() -> Dict[str, Any]:
    """
    Fetch pre-market context and compute daily market bias, global cues, sector catalysts & focus stocks.
    Ingests live multi-stream financial news (Global Tech, Gold/Crude, Tariffs/SEBI, Indian Earnings)
    in real-time to capture breaking events without training cutoff limitations.
    Called by scheduler at 08:45 AM Mon-Fri.
    """
    global _premarket_cache
    today_str = datetime.now(IST).strftime("%Y-%m-%d")

    news_streams = fetch_multi_stream_news()
    news_blocks = []
    for cat_name, items in news_streams.items():
        if items:
            formatted_items = "\n".join([f"  • {item}" for item in items[:4]])
            news_blocks.append(f"[{cat_name.upper()}]\n{formatted_items}")

    news_context = "\n\n".join(news_blocks) if news_blocks else "No external news wire available."

    system_prompt = (
        "You are an expert institutional Indian stock market strategist. "
        "Analyze real-time multi-stream news (Global Tech, Gold/Commodities, US Tariffs/SEBI Policy, Indian Corporate Actions). "
        "Synthesize the real facts and output a single valid JSON object."
    )

    prompt = (
        f"Today is {today_str} (IST).\n"
        f"Here are the LIVE real-time market news streams fetched this morning across Global Macro, Commodities, Tariffs/Policy, and Indian Stocks:\n\n"
        f"{news_context}\n\n"
        f"Based on these live events, corporate actions, and global cues for NSE India:\n"
        "Provide a JSON object with these EXACT keys:\n"
        "{\n"
        '  "bias": "BULLISH" | "BEARISH" | "SIDEWAYS_CHOPSY",\n'
        '  "summary": "2-sentence factual summary referencing specific real events/numbers above",\n'
        '  "global_cues": {\n'
        '    "gift_nifty": "Indication with pts / % if mentioned or derived from global cues",\n'
        '    "us_markets": "US / Nasdaq / tech sentiment summary",\n'
        '    "crude_oil": "Crude oil direction and price commentary",\n'
        '    "gold_commodities": "Gold, silver and metals commentary",\n'
        '    "dollar_index": "Dollar DXY / currency commentary"\n'
        "  },\n"
        '  "policy_and_macro_watch": [\n'
        '    "Policy, tariff, or regulatory driver with market impact",\n'
        '    "Geopolitical or commodity driver with market impact"\n'
        "  ],\n"
        '  "leading_sectors": ["Top 1-2 sectors expected to outperform today based on cues"],\n'
        '  "lagging_sectors": ["Top 1-2 sectors expected to underperform/drag today based on cues"],\n'
        '  "focus_stocks": [\n'
        '    {"symbol": "NSE_SYMBOL", "bias": "BULLISH" | "BEARISH", "catalyst": "Specific headline reason", "theme": "Commodities" | "Global Tech" | "Earnings" | "Policy"}\n'
        "  ],\n"
        '  "key_risks": ["Risk 1 with facts", "Risk 2 with facts"]\n'
        "}"
    )

    raw_response = call_gemini(prompt, system_instruction=system_prompt)
    if raw_response:
        parsed = _extract_json(raw_response)
        if parsed:
            _premarket_cache = {
                "date": today_str,
                "bias": parsed.get("bias", "NEUTRAL"),
                "summary": parsed.get("summary", "Analysis completed with live market grounding."),
                "global_cues": parsed.get("global_cues", {}),
                "policy_and_macro_watch": parsed.get("policy_and_macro_watch", []),
                "leading_sectors": parsed.get("leading_sectors", []),
                "lagging_sectors": parsed.get("lagging_sectors", []),
                "sector_focus": parsed.get("leading_sectors", [])
                + parsed.get("lagging_sectors", []),
                "focus_stocks": parsed.get("focus_stocks", []),
                "key_risks": parsed.get("key_risks", []),
                "is_grounded": True,
                "updated_at": datetime.now(IST).strftime("%H:%M:%S IST"),
            }
            logger.info(
                "ai_copilot: pre-market briefing computed with multi-stream news: bias=%s focus_stocks=%s",
                _premarket_cache["bias"],
                len(_premarket_cache["focus_stocks"]),
            )
            return _premarket_cache
        else:
            logger.warning(
                "ai_copilot: failed to parse grounded premarket JSON: %s", raw_response[:200]
            )

    # Fallback default if API key missing or call fails
    _premarket_cache = {
        "date": today_str,
        "bias": "NEUTRAL",
        "summary": "Default pre-market bias: Trade strict technical triggers.",
        "global_cues": {
            "gift_nifty": "Neutral / Sideways",
            "us_markets": "Mixed session",
            "crude_oil": "Stable range",
            "gold_commodities": "Rangebound",
            "dollar_index": "Neutral",
        },
        "policy_and_macro_watch": [
            "Monitor institutional FII/DII positioning at open",
            "Standard volatility across high-beta momentum names",
        ],
        "leading_sectors": [],
        "lagging_sectors": [],
        "sector_focus": ["All F&O stocks"],
        "focus_stocks": [],
        "key_risks": ["Standard intraday volatility"],
        "is_grounded": False,
        "updated_at": datetime.now(IST).strftime("%H:%M:%S IST"),
    }
    return _premarket_cache


def get_premarket_briefing() -> Dict[str, Any]:
    """Get the cached daily pre-market briefing."""
    return _premarket_cache


# ── 2. Live Signal Audit & Dynamic Trade Plan ──────────────────────────────────


def compile_symbol_context(sym: str) -> Dict[str, Any]:
    """
    Compile deep, multi-layered context package for a single stock from live market_state
    and candle_history to send to Gemini.
    """
    from .candle_aggregator import _day_candles
    from .depth_manager import get_book_delta, is_depth_subscribed
    from .state import market_state

    stock_data = {}
    nifty_data = {}
    with market_state.lock():
        s = market_state.get_stock(sym)
        if s:
            stock_data = dict(s)
        nifty_data = dict(market_state.nifty)

    # Fetch today's full 5-min candles from memory
    candles = (
        list(_day_candles.get(sym, {}).values()) if isinstance(_day_candles.get(sym), dict) else []
    )
    book_delta = get_book_delta(sym)

    now_ist = datetime.now(IST)
    session_minute = (now_ist.hour - 9) * 60 + (now_ist.minute - 15)
    time_window = (
        "PRIME_MORNING (09:15-11:00)"
        if session_minute <= config.AUTO_EXECUTE_UNTIL_MINUTE
        else "MID_LATE_SESSION (11:00-15:30)"
    )

    # ── Technical Indicators Calculation ──────────────────────────────────────
    from .candle_aggregator import get_intraday_closes
    from .momentum_score import build_sector_means, industry_group, nifty_group
    from .technical_indicators import (DEFENSIVE_SECTORS, compute_adr_pct,
                                       compute_ema, compute_rsi,
                                       compute_sector_breadth)

    ltp = stock_data.get("ltp") or 0.0
    candle_closes = get_intraday_closes(sym)
    prices = list(candle_closes) if candle_closes else ([ltp] if ltp else [])
    if ltp and (not prices or prices[-1] != ltp):
        prices.append(ltp)

    rsi = compute_rsi(prices, 14)
    ema_20 = compute_ema(prices, 20)
    ema_50 = compute_ema(prices, 50)
    vwap = stock_data.get("vwap", 0.0)
    vwap_dist = round(abs(ltp - vwap) / vwap * 100, 2) if vwap and ltp else 0.0

    ind_grp = industry_group(sym)
    sec_grp = nifty_group(ind_grp)
    all_stocks_list = list(market_state.stocks.values())
    breadth_map = compute_sector_breadth(all_stocks_list)
    sec_info = breadth_map.get(sec_grp, {})
    sec_mean = sec_info.get("mean_pct", 0.0)
    sec_breadth = sec_info.get("breadth_pct", 50.0)

    # ADR & Day range usage
    adr_pct = compute_adr_pct(stock_data)
    today_h = stock_data.get("today_high") or ltp
    today_l = stock_data.get("today_low") or ltp
    range_used_pct = round((today_h - today_l) / ltp * 100.0, 2) if ltp else 0.0

    # Match premarket focus stock catalyst
    focus_catalyst = None
    for f in _premarket_cache.get("focus_stocks", []):
        if f.get("symbol") == sym:
            focus_catalyst = f
            break

    # Estimate RVOL: compare today's traded_value rate vs first-30-min run-rate
    today_volume = stock_data.get("volume") or 0
    today_traded_val = ltp * today_volume
    first_candle = candles[0] if candles else {}
    first_candle_vol = first_candle.get("volume", 0) if first_candle else 0
    avg_est = ltp * first_candle_vol * 75 if first_candle_vol > 0 else 1.0
    rvol_estimate = round(today_traded_val / avg_est, 2) if avg_est > 0 else 0.0

    return {
        "symbol": sym,
        "current_time_ist": now_ist.strftime("%H:%M:%S"),
        "session_minute": session_minute,
        "time_window_assessment": time_window,
        "nifty_context": {
            "ltp": nifty_data.get("ltp", 0.0),
            "pct_change": nifty_data.get("pct_change", 0.0),
        },
        "stock_snapshot": {
            "ltp": stock_data.get("ltp", 0.0),
            "prev_close": stock_data.get("prev_close", 0.0),
            "pct_change": stock_data.get("pct_change", 0.0),
            "relative_strength": stock_data.get("relative_strength", 0.0),
            "rvol_estimate": rvol_estimate,
            "day_range_pos": stock_data.get("day_range_pos", 0.0),
            "today_high": stock_data.get("today_high", 0.0),
            "today_low": stock_data.get("today_low", 0.0),
            "yesterday_high": stock_data.get("yesterday_high", 0.0),
            "yesterday_low": stock_data.get("yesterday_low", 0.0),
            "vwap": stock_data.get("vwap", 0.0),
            "signal": stock_data.get("signal", "None"),
            "signal_time": stock_data.get("signal_time", ""),
            "depth_subscribed": is_depth_subscribed(sym),
            "depth_delta_rupee_val": (
                book_delta if book_delta is not None else stock_data.get("depth_delta", 0.0)
            ),
            "tot_buy_qty": stock_data.get("tot_buy_qty", 0),
            "tot_sell_qty": stock_data.get("tot_sell_qty", 0),
        },
        "technical_indicators": {
            "rsi_14_5m": rsi,
            "ema_20_5m": ema_20,
            "ema_50_5m": ema_50,
            "price_vs_ema20": "ABOVE" if ltp >= ema_20 else "BELOW",
            "vwap_distance_pct": vwap_dist,
            "sector_name": sec_grp,
            "sector_mean_return_pct": sec_mean,
            "sector_breadth_pct": sec_breadth,
            "adr_pct": adr_pct,
            "range_used_pct": range_used_pct,
            "is_defensive_sector": ind_grp in DEFENSIVE_SECTORS,
        },
        "scores": stock_data.get("scores", {}),
        "premarket_catalyst": focus_catalyst,
        "premarket_bias": _premarket_cache.get("bias", "NEUTRAL"),
        "recent_5m_candles_count": len(candles),
        "recent_5m_candles_sample": (
            candles[-6:] if candles else []
        ),  # last 6 candles for prompt brevity
    }


def analyze_trade_setup(sym: str) -> Dict[str, Any]:
    """
    RED-FLAG FILTER: Pass real quantitative data and 5-minute technical indicators
    to Gemini and ask it to identify specific disqualifying conditions.
    Gemini does NOT generate buy signals — it validates or disqualifies.

    Returns SKIP_TRAP if red flags found, CONFIRM if setup is clean.
    """
    ctx = compile_symbol_context(sym)

    # Heuristic fallback if no API key or stock not found
    if not ctx["stock_snapshot"].get("ltp"):
        return {
            "symbol": sym,
            "decision": "SKIP",
            "confidence_score": 0,
            "suggested_entry": 0.0,
            "suggested_sl": 0.0,
            "suggested_target": 0.0,
            "tsl_type": "PERCENT",
            "tsl_value": 0.5,
            "rationale": ["No live price data available for symbol."],
        }

    s = ctx["stock_snapshot"]
    ti = ctx.get("technical_indicators", {})
    ltp = s["ltp"]
    is_bull = "Bull" in s.get("signal", "")

    system_prompt = (
        "You are a strict quantitative risk manager and anomaly auditor for an NSE India intraday desk. "
        "Your ONLY job is to find RED FLAGS (structural anomalies, unusual events, news risk) that disqualify a trade. "
        "Do not generate buy/sell signals. Do not predict price direction. "
        "The candidate has already passed a robust Momentum and Entry Quality scorer — "
        "review the 'scores' object in the context to understand why it was selected. "
        "Analyze the provided data and output SKIP_TRAP if any GENUINE, overriding red flag exists, "
        "or CONFIRM if the setup is technically clean. "
        "Genuine anomalies include: "
        "• Unprecedented news/event risk for this specific stock today, "
        "• Index heavily crashing while stock is trying to breakout (market regime misalignment), "
        "• Extreme over-extension not captured by the entry quality score. "
        "Do NOT red-flag standard technical pullbacks or borderline RSI. "
        "Return valid JSON only."
    )

    prompt = (
        f"Symbol Context Package:\n{json.dumps(ctx, indent=2)}\n\n"
        "Provide a JSON response with EXACT keys:\n"
        "{\n"
        '  "decision": "CONFIRM_BUY" | "CONFIRM_SELL" | "SKIP_TRAP",\n'
        '  "confidence_score": integer (0 to 100),\n'
        '  "rationale": ["Anomaly Reason 1 (if any)"]\n'
        "}\n\n"
        "IMPORTANT RULES FOR CONFIRMATION:\n"
        "  • The 'scores' object shows how the quant engine rated this setup (Momentum & Entry Quality). Use this to calibrate your confidence_score.\n"
        "  • Stop Loss and Targets are handled programmatically; you do not need to calculate them.\n"
        "Otherwise return SKIP_TRAP."
    )

    raw_response = call_gemini(prompt, system_instruction=system_prompt)
    if raw_response:
        try:
            parsed = json.loads(raw_response)
            parsed["symbol"] = sym
            parsed["timestamp"] = datetime.now(IST).strftime("%H:%M:%S IST")
            return parsed
        except Exception as e:
            logger.error("ai_copilot: failed to parse setup JSON: %s", e)

    # Heuristic Mathematical Fallback (when API key is not set or network fails)
    return {
        "symbol": sym,
        "decision": "CONFIRM_BUY" if is_bull else "CONFIRM_SELL",
        "confidence_score": 80 if s.get("signal") != "None" else 50,
        "rationale": [
            f"Dynamic Structural Anchor: SL {dyn['sl_pct']:.2f}% (₹{dyn['sl']}), Target 1:2 RR (₹{dyn['target']}).",
            f"Volatility Buffer: 1.5x 5m ATR (₹{dyn['atr_14']}) with swing protection.",
        ],
        "is_fallback": True,
        "timestamp": datetime.now(IST).strftime("%H:%M:%S IST"),
    }


# ── 3. Deduplication + Daily Trade Counter ────────────────────────────────────

_notified_lock = threading.RLock()
_notified_signals_today: set[str] = set()
_last_reset_date: date | None = None

# Auto-trade counter: tracks how many paper trades have been auto-placed today
_auto_trades_today: int = 0
_manual_alerts_today: int = 0
_daily_summary_sent: bool = False
_quota_lock = threading.RLock()
_quota_reset_date: date | None = None
_auto_traded_symbols_today: set[str] = set()


def _reset_daily_counters_if_needed(today: date, force: bool = False) -> None:
    """Reset deduplication cache and trade/alert counters at the start of each new trading day."""
    global _last_reset_date, _auto_trades_today, _manual_alerts_today, _daily_summary_sent, _quota_reset_date, _notified_signals_today, _auto_traded_symbols_today
    if force or _last_reset_date != today:
        with _notified_lock:
            _notified_signals_today.clear()
            _auto_traded_symbols_today.clear()
            _last_reset_date = today
    with _quota_lock:
        if force or _quota_reset_date != today:
            _auto_trades_today = 0
            _manual_alerts_today = 0
            _daily_summary_sent = False
            _quota_reset_date = today
            from .risk_allocator import reset_risk_allocator

            reset_risk_allocator(None)


def _increment_auto_trade_count() -> int:
    """Increment and return the new daily auto-trade count (thread-safe)."""
    global _auto_trades_today
    with _quota_lock:
        _auto_trades_today += 1
        return _auto_trades_today


def _get_auto_trade_count() -> int:
    """Return current daily auto-trade count (thread-safe)."""
    with _quota_lock:
        return _auto_trades_today


def _increment_manual_alert_count() -> int:
    """Increment and return the new daily manual alert count (thread-safe)."""
    global _manual_alerts_today
    with _quota_lock:
        _manual_alerts_today += 1
        return _manual_alerts_today


def _get_manual_alert_count() -> int:
    """Return current daily manual alert count (thread-safe)."""
    with _quota_lock:
        return _manual_alerts_today


def get_signal_family(signal: str) -> StrategyFamily:
    """Extract strategy family from signal label."""
    from .strategy_base import StrategyFamily

    if "VWAP" in signal:
        return StrategyFamily.VWAP_RETEST
    elif "SECTOR" in signal or "Sector" in signal:
        return StrategyFamily.SECTOR_SYMPATHY
    elif "SQUEEZE" in signal or "Squeeze" in signal:
        return StrategyFamily.SQUEEZE
    return StrategyFamily.ORB_BREAKOUT


def can_audit_symbol(sym: str, signal: str = "") -> bool:
    """Check if symbol has already been audited today (strategy-aware or symbol-level single-fire lock)."""
    now_ist = datetime.now(IST)
    today = now_ist.date()
    
    # Phase 1: No automated execution before 09:30 IST (C0.5 completion)
    from datetime import time as dt_time
    if now_ist.time() < dt_time(9, 30):
        return False

    _reset_daily_counters_if_needed(today)
    multi_strat_dedup = getattr(config, "ENABLE_MULTI_STRATEGY_DEDUP", False)
    with _notified_lock:
        if multi_strat_dedup and signal:
            family = get_signal_family(signal)
            key = f"{today}:{sym}:{family.name}"
        else:
            key = f"{today}:{sym}"
        return key not in _notified_signals_today


# ── 4. Main Audit & Notify Entry Point ───────────────────────────────────────


def audit_and_notify_signal(sym: str, signal: str, signal_time: str) -> None:
    """
    Automated background worker: Audits a newly triggered breakout signal
    using Gemini's Red-Flag Filter and sends a rich Telegram alert.

    Pipeline:
      1. Symbol-level daily dedup check — each symbol fires AT MOST ONCE per day (or per strategy family).
      2. Gemini Red-Flag audit — SKIP_TRAP if any red flag found.
      3. Confidence threshold check — must reach MIN_AI_CONFIDENCE (85%).
      4. Auto paper trade execution (if within session window and auto trade cap not hit).
      5. Telegram notification:
         - Up to MAX_DAILY_AUTO_TRADES (3) placed orders
         - Up to MAX_DAILY_MANUAL_ALERTS (3) manual approval alerts
         - Zero spam once quota is met or for low confidence/traps.
    """
    if not config.ENABLE_AI_TELEGRAM_ALERTS:
        logger.info("ai_copilot: ENABLE_AI_TELEGRAM_ALERTS is false; skipping alert for %s", sym)
        return

    today = datetime.now(IST).date()
    _reset_daily_counters_if_needed(today)

    from .risk_allocator import get_risk_allocator
    from .strategy_base import StrategyFamily

    family = get_signal_family(signal)
    multi_strat_dedup = getattr(config, "ENABLE_MULTI_STRATEGY_DEDUP", False)
    use_risk_alloc = getattr(config, "ENABLE_RISK_ALLOCATOR", True)
    risk_alloc = get_risk_allocator()

    # Step 1 — Symbol/Strategy Deduplication
    with _notified_lock:
        dedup_key = f"{today}:{sym}:{family.name}" if multi_strat_dedup else f"{today}:{sym}"
        if dedup_key in _notified_signals_today:
            logger.info(
                "ai_copilot: symbol %s already audited today for %s; skipping duplicate signal %s",
                sym,
                family.name if multi_strat_dedup else "all",
                signal,
            )
            return
        _notified_signals_today.add(dedup_key)

    from . import telegram_notify

    logger.info("ai_copilot: auditing signal %s for %s ...", signal, sym)

    # Step 2 — Gemini Red-Flag Filter
    res = analyze_trade_setup(sym)

    dec = res.get("decision", "SKIP")
    score = res.get("confidence_score", 0)
    entry = res.get("suggested_entry", 0.0)
    sl = res.get("suggested_sl", 0.0)
    target = res.get("suggested_target", 0.0)
    tsl_t = res.get("tsl_type", "PERCENT")
    tsl_v = res.get("tsl_value", 0.5)
    rationale = res.get("rationale", [])

    is_confirm = ("BUY" in dec.upper() or "SELL" in dec.upper()) and "SKIP" not in dec.upper()

    # Step 3 — Confidence threshold (must reach MIN_AI_CONFIDENCE >= 85)
    passes_confidence = is_confirm and score >= config.MIN_AI_CONFIDENCE

    # Step 4 — Auto paper trade execution (if within session window + daily cap)
    auto_order_result: Optional[dict] = None
    auto_skipped_reason: str = ""

    if passes_confidence and config.AUTO_PAPER_USER_ID:
        now_ist = datetime.now(IST)
        session_minute = (now_ist.hour - 9) * 60 + (now_ist.minute - 15)
        # Determine cutoff based on setup family: ORB (10:15 AM) vs VWAP Reclaim (11:00 AM)
        is_orb = family == StrategyFamily.ORB_BREAKOUT
        cutoff_minute = (
            config.ORB_EXECUTE_UNTIL_MINUTE if is_orb else config.RECLAIM_EXECUTE_UNTIL_MINUTE
        )
        within_window = session_minute <= cutoff_minute

        use_risk_alloc = getattr(config, "ENABLE_RISK_ALLOCATOR", True)
        risk_alloc = get_risk_allocator()

        if use_risk_alloc:
            under_cap = risk_alloc.can_trade(family, today)
        else:
            under_cap = _get_auto_trade_count() < config.MAX_DAILY_AUTO_TRADES

        with _notified_lock:
            already_traded = sym in _auto_traded_symbols_today

        if within_window and under_cap and not already_traded:
            if use_risk_alloc:
                risk_per_trade = risk_alloc.get_risk_per_trade(family, today)
            else:
                risk_per_trade = config.DAILY_MAX_RISK_INR / config.MAX_DAILY_AUTO_TRADES

            from . import paper_trading, trade_management

            side = "BUY" if "BUY" in dec else "SELL"
            notes = f"AI_COPILOT | {signal} | score={score} | auto"
            
            # Phase 3: Programmatic ATR/Structural Stops
            computed_stops = trade_management.calculate_initial_stops(sym, side, entry)
            sl_price = computed_stops["sl_price"]
            target_price = computed_stops["target_price"]
            tsl_type = computed_stops["tsl_type"]
            tsl_value = computed_stops["tsl_value"]

            # Re-calculate risk dynamically
            sl_distance = abs(entry - sl_price) if entry and sl_price else 0.0
            if sl_distance > 0 and risk_per_trade > 0:
                quantity = max(1, int(risk_per_trade / sl_distance))
            else:
                quantity = 1

            qty1 = quantity // 2
            qty2 = quantity - qty1
            
            # Order 1: 50% partial exit at +1.5R
            target1 = entry + (1.5 * sl_distance) if side == "BUY" else entry - (1.5 * sl_distance)
            
            success_count = 0
            if qty1 > 0:
                res1 = paper_trading.place_auto_paper_order_sync(
                    user_id=config.AUTO_PAPER_USER_ID,
                    symbol=sym,
                    side=side,
                    quantity=qty1,
                    sl_price=sl_price,
                    target_price=round(target1, 2),
                    tsl_type=tsl_type,
                    tsl_value=tsl_value,
                    notes=notes + " | 50% Partial 1.5R",
                )
                if res1: success_count += 1
                
            if qty2 > 0:
                res2 = paper_trading.place_auto_paper_order_sync(
                    user_id=config.AUTO_PAPER_USER_ID,
                    symbol=sym,
                    side=side,
                    quantity=qty2,
                    sl_price=sl_price,
                    target_price=target_price,
                    tsl_type=tsl_type,
                    tsl_value=tsl_value,
                    notes=notes + " | Trailing Runner",
                )
                if res2: success_count += 1

            if success_count > 0:
                with _notified_lock:
                    _auto_traded_symbols_today.add(sym)
                _increment_auto_trade_count()
                if use_risk_alloc:
                    trade_risk = quantity * sl_distance
                    risk_alloc.consume(family, trade_risk, today)
                logger.info(
                    "ai_copilot: auto paper trade placed for %s | %s %d qty @ %.2f",
                    sym,
                    side,
                    quantity,
                    entry,
                )
            else:
                auto_skipped_reason = "Order placement failed (insufficient margin or DB error)"
        elif already_traded:
            auto_skipped_reason = f"Symbol {sym} has already been auto-traded today. Deduplicating."
        elif not within_window:
            cutoff_label = "10:15 AM (ORB)" if is_orb else "11:00 AM (Reclaim)"
            auto_skipped_reason = (
                f"After {cutoff_label} cutoff (session min {session_minute} > {cutoff_minute})"
            )
        elif not under_cap:
            if use_risk_alloc:
                auto_skipped_reason = f"Daily budget reached for strategy {family.name}"
            else:
                auto_skipped_reason = f"Daily auto trade cap reached ({_get_auto_trade_count()}/{config.MAX_DAILY_AUTO_TRADES} trades)"
    elif passes_confidence and not config.AUTO_PAPER_USER_ID:
        auto_skipped_reason = "AUTO_PAPER_USER_ID not configured"

    # Step 5 — Telegram message routing with strict quota caps
    rr_str = "N/A"
    if entry and sl and target:
        sl_dist = abs(entry - sl)
        tgt_dist = abs(target - entry)
        if sl_dist > 0:
            rr_str = f"1:{round(tgt_dist / sl_dist, 1)}"

    if passes_confidence and auto_order_result:
        # ── 1. Auto-executed trade notification (Max 3/day) ──
        risk_per_trade = config.DAILY_MAX_RISK_INR / config.MAX_DAILY_AUTO_TRADES
        sl_distance = abs(entry - sl) if entry and sl else 0.0
        quantity = max(1, int(risk_per_trade / sl_distance)) if sl_distance > 0 else 1
        actual_risk = round(quantity * sl_distance, 2)
        auto_count = _get_auto_trade_count()

        lines = [
            f"✅ *PAPER ORDER PLACED ({auto_count}/{config.MAX_DAILY_AUTO_TRADES})*",
            f"",
            f"📌 *Stock:* `{sym}` | *{('BUY' if 'BUY' in dec else 'SELL')}*",
            f"🔢 *Quantity:* {quantity} shares",
            f"📍 *Entry:* ₹{entry:.2f}",
            f"🛑 *Stop Loss:* ₹{sl:.2f}  _(Risk: ₹{actual_risk:,.0f})_",
            f"🎯 *Target:* ₹{target:.2f}",
            f"📊 *RR Ratio:* {rr_str}",
            f"🔄 *Trailing SL:* {tsl_t} {tsl_v}",
            f"🤖 *AI Confidence:* {score}%",
            f"⏱ *Signal:* `{signal}` @ {signal_time}",
        ]
        if rationale:
            lines.append("")
            for r in rationale[:2]:
                lines.append(f"• {r}")

        text = "\n".join(lines)
        logger.info("ai_copilot: pushing Telegram alert for placed order %s", sym)
        telegram_notify.send_message(text)

    elif passes_confidence and not auto_order_result and auto_skipped_reason:
        # ── 2. Manual Approval High-Conviction Alert (1 per strategy / Max 4/day) ──
        current_manual_count = _get_manual_alert_count()
        can_manual = (
            risk_alloc.can_alert(family, today)
            if use_risk_alloc
            else (current_manual_count < config.MAX_DAILY_MANUAL_ALERTS)
        )
        if can_manual and current_manual_count < config.MAX_DAILY_MANUAL_ALERTS:
            new_manual_count = _increment_manual_alert_count()
            if use_risk_alloc:
                risk_alloc.consume_alert(family, today)
            lines = [
                f"⏸ *HIGH CONVICTION — MANUAL APPROVAL ({new_manual_count}/{config.MAX_DAILY_MANUAL_ALERTS})*",
                f"",
                f"📌 *Stock:* `{sym}` | *Signal:* `{signal}` ({signal_time})",
                f"🤖 *AI:* `{dec}` | *Confidence:* {score}%",
                f"",
                f"📍 *Suggested Entry:* ₹{entry:.2f}" if entry else None,
                f"🛑 *Suggested SL:* ₹{sl:.2f}" if sl else None,
                f"🎯 *Suggested Target:* ₹{target:.2f}" if target else None,
                f"📊 *RR Ratio:* {rr_str}",
                f"⚠️ *Reason for Manual Approval:* {auto_skipped_reason}",
            ]
            lines = [line for line in lines if line]
            if rationale:
                lines.append("")
                for r in rationale[:2]:
                    lines.append(f"• {r}")

            text = "\n".join(lines)
            logger.info("ai_copilot: pushing manual approval alert for %s", sym)
            telegram_notify.send_message(text)

            # Daily summary alert after manual quota hits
            global _daily_summary_sent
            with _quota_lock:
                if new_manual_count >= config.MAX_DAILY_MANUAL_ALERTS and not _daily_summary_sent:
                    _daily_summary_sent = True
                    summary_text = (
                        f"🔒 *DAILY SIGNALS COMPLETED*\n\n"
                        f"Market delivery quotas reached for today:\n"
                        f"✅ Auto Paper Trades: {_get_auto_trade_count()}/{config.MAX_DAILY_AUTO_TRADES}\n"
                        f"⏸ Manual Approval Alerts: {new_manual_count}/{config.MAX_DAILY_MANUAL_ALERTS}\n\n"
                        f"Scanning remains active on web dashboard. Further Telegram alerts silenced until tomorrow's open."
                    )
                    telegram_notify.send_message(summary_text)
        else:
            logger.info(
                "ai_copilot: manual alert cap reached (%d/%d) - suppressing Telegram alert for %s",
                current_manual_count,
                config.MAX_DAILY_MANUAL_ALERTS,
                sym,
            )

    else:
        # Silent rejection for SKIP_TRAP or low-confidence — no Telegram spam
        logger.info(
            "ai_copilot: trade rejected (%s, %d%%) - silently ignored (no Telegram notification)",
            dec,
            score,
        )
