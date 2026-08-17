"""
AI Trade Copilot & Market Context Engine.

Integrates with Google Gemini API (gemini-2.0-flash / gemini-1.5-flash) to provide:
1. Pre-Market Daily Briefing (08:45 AM): Global cues, daily market bias, and risk events.
2. High-Conviction Signal Audit: Rich intraday context analysis (Full-day 5-min candles,
   PDH/PDL levels, VWAP, RS vs NIFTY, order book depth delta, time-of-day weight) to
   output CONFIRM/SKIP decision, Confidence Score (0-100), Entry, SL, Target, TSL, and Rationale.

Fallback safety: If GEMINI_API_KEY is not set or API fails, gracefully returns structured
heuristic fallbacks without crashing the app or stopping execution.
"""

import json
import logging
import os
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, Optional

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


def _get_api_key() -> str:
    return os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)


def call_gemini(prompt: str, system_instruction: Optional[str] = None) -> Optional[str]:
    """
    Call Google Gemini REST API directly using standard urllib (no heavy SDK needed).
    Returns raw text output from the model or None on failure.
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
            "responseMimeType": "application/json",
        },
    }

    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            candidates = body.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "")
    except Exception as e:
        logger.exception("ai_copilot: Gemini API call failed: %s", e)

    return None


# ── 1. Pre-Market Daily Briefing (08:45 AM) ───────────────────────────────────

def run_premarket_briefing() -> Dict[str, Any]:
    """
    Fetch pre-market context and compute daily market bias & risk events.
    Called by scheduler at 08:45 AM Mon-Fri.
    """
    global _premarket_cache
    today_str = datetime.now(IST).strftime("%Y-%m-%d")

    system_prompt = (
        "You are an expert Indian stock market pre-market analyst. "
        "Return valid JSON only matching the schema requested."
    )

    prompt = (
        f"Today is {today_str} (IST). Analyze current global market conditions for NSE India trading.\n"
        "Provide a JSON object with these keys:\n"
        '{\n'
        '  "bias": "BULLISH" | "BEARISH" | "SIDEWAYS_CHOPSY",\n'
        '  "summary": "2-sentence executive summary of pre-market cues",\n'
        '  "key_risks": ["Risk 1", "Risk 2"],\n'
        '  "sector_focus": ["Sectors to watch positive/negative"]\n'
        '}'
    )

    raw_response = call_gemini(prompt, system_instruction=system_prompt)
    if raw_response:
        try:
            parsed = json.loads(raw_response)
            _premarket_cache = {
                "date": today_str,
                "bias": parsed.get("bias", "NEUTRAL"),
                "summary": parsed.get("summary", "Analysis completed."),
                "key_risks": parsed.get("key_risks", []),
                "sector_focus": parsed.get("sector_focus", []),
                "updated_at": datetime.now(IST).strftime("%H:%M:%S IST"),
            }
            logger.info("ai_copilot: pre-market briefing computed: bias=%s", _premarket_cache["bias"])
            return _premarket_cache
        except Exception as e:
            logger.error("ai_copilot: failed to parse premarket JSON: %s", e)

    # Fallback default if API key missing or call fails
    _premarket_cache = {
        "date": today_str,
        "bias": "NEUTRAL",
        "summary": "Default pre-market bias: Trade strict technical triggers.",
        "key_risks": ["Standard intraday volatility"],
        "sector_focus": ["All F&O stocks"],
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
    from .state import market_state
    from .candle_aggregator import _day_candles
    from .depth_manager import get_book_delta, is_depth_subscribed

    stock_data = {}
    nifty_data = {}
    with market_state.lock():
        s = market_state.get_stock(sym)
        if s:
            stock_data = dict(s)
        nifty_data = dict(market_state.nifty)

    # Fetch today's full 5-min candles from memory
    candles = list(_day_candles.get(sym, {}).values()) if isinstance(_day_candles.get(sym), dict) else []
    book_delta = get_book_delta(sym)

    now_ist = datetime.now(IST)
    session_minute = (now_ist.hour - 9) * 60 + (now_ist.minute - 15)
    time_window = "PRIME_MORNING (09:15-11:30)" if session_minute <= 135 else "MID_LATE_SESSION (11:30-15:30)"

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
            "day_range_pos": stock_data.get("day_range_pos", 0.0),
            "today_high": stock_data.get("today_high", 0.0),
            "today_low": stock_data.get("today_low", 0.0),
            "yesterday_high": stock_data.get("yesterday_high", 0.0),
            "yesterday_low": stock_data.get("yesterday_low", 0.0),
            "vwap": stock_data.get("vwap", 0.0),
            "signal": stock_data.get("signal", "None"),
            "signal_time": stock_data.get("signal_time", ""),
            "depth_subscribed": is_depth_subscribed(sym),
            "depth_delta_rupee_val": book_delta if book_delta is not None else stock_data.get("depth_delta", 0.0),
            "tot_buy_qty": stock_data.get("tot_buy_qty", 0),
            "tot_sell_qty": stock_data.get("tot_sell_qty", 0),
        },
        "premarket_bias": _premarket_cache.get("bias", "NEUTRAL"),
        "recent_5m_candles_count": len(candles),
        "recent_5m_candles_sample": candles[-6:] if candles else [],  # last 6 candles for prompt brevity
    }


def analyze_trade_setup(sym: str) -> Dict[str, Any]:
    """
    Perform deep AI audit of a stock setup and return entry, SL, Target, TSL, and score.
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

    system_prompt = (
        "You are a professional quantitative momentum trader on NSE India. "
        "Analyze the provided stock context package and determine if this is a high-conviction trade setup. "
        "Rule 1: Intraday momentum is strongest between 09:15-11:30 AM. Penalize setups after 12:30 PM. "
        "Rule 2: Respect Previous Day High (PDH) and Low (PDL) as major resistance/support. "
        "Rule 3: Ensure Risk-to-Reward ratio is at least 1:1.5. "
        "Return valid JSON only matching the schema."
    )

    prompt = (
        f"Symbol Context Package:\n{json.dumps(ctx, indent=2)}\n\n"
        "Provide a JSON response with exact keys:\n"
        "{\n"
        '  "decision": "CONFIRM_BUY" | "CONFIRM_SELL" | "SKIP_TRAP",\n'
        '  "confidence_score": integer (0 to 100),\n'
        '  "suggested_entry": float,\n'
        '  "suggested_sl": float,\n'
        '  "suggested_target": float,\n'
        '  "tsl_type": "PERCENT" | "POINTS",\n'
        '  "tsl_value": float,\n'
        '  "rationale": ["Point 1", "Point 2"]\n'
        "}"
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
    s = ctx["stock_snapshot"]
    ltp = s["ltp"]
    sig = s["signal"]
    is_bull = "Bull" in sig or s["pct_change"] > 0
    atr_est = max(ltp * 0.008, 1.0)  # ~0.8% estimated ATR volatility

    sl = round(ltp - (atr_est * 1.2), 2) if is_bull else round(ltp + (atr_est * 1.2), 2)
    target = round(ltp + (atr_est * 2.4), 2) if is_bull else round(ltp - (atr_est * 2.4), 2)
    decision = "CONFIRM_BUY" if is_bull else "CONFIRM_SELL"

    return {
        "symbol": sym,
        "decision": decision,
        "confidence_score": 75 if sig != "None" else 50,
        "suggested_entry": ltp,
        "suggested_sl": sl,
        "suggested_target": target,
        "tsl_type": "PERCENT",
        "tsl_value": 0.5,
        "rationale": [
            f"Heuristic fallback: {sig} signal active.",
            f"SL set at 1.2x estimated ATR (₹{sl}), Target 1:2 RR (₹{target}).",
        ],
        "is_fallback": True,
        "timestamp": datetime.now(IST).strftime("%H:%M:%S IST"),
    }
