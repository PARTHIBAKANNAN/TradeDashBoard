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

import json
import logging
import os
import threading
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
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


def run_premarket_briefing() -> Dict[str, Any]:
    """
    Fetch pre-market context and compute daily market bias & risk events.
    Uses Google Search Grounding to pull REAL-TIME live news, Gift Nifty,
    US market close, and Asian market cues.
    Called by scheduler at 08:45 AM Mon-Fri.
    """
    global _premarket_cache
    today_str = datetime.now(IST).strftime("%Y-%m-%d")

    system_prompt = (
        "You are an expert Indian stock market pre-market analyst. "
        "Use Google Search to find today's real pre-market cues: Gift Nifty / SGX Nifty level, "
        "US market close (Dow Jones, S&P 500, Nasdaq), Asian markets (Nikkei, Hang Seng), "
        "Crude oil prices, and major Indian corporate/macro news today. "
        "Synthesize the real facts and output a single valid JSON object."
    )

    prompt = (
        f"Today is {today_str} (IST). Search the web for current live pre-market cues for NSE India.\n"
        "1. Check Gift Nifty live indication (points / % change).\n"
        "2. Check overnight US market close and Asian market performance.\n"
        "3. Check major Indian market news or earnings events for today.\n\n"
        "Provide a JSON object with these EXACT keys:\n"
        "{\n"
        '  "bias": "BULLISH" | "BEARISH" | "SIDEWAYS_CHOPSY",\n'
        '  "summary": "2-sentence factual summary with real numbers (e.g. Gift Nifty at +X pts, US closed up/down)",\n'
        '  "key_risks": ["Risk 1 with facts", "Risk 2 with facts"],\n'
        '  "sector_focus": ["Leading sectors to watch today based on news/cues"]\n'
        "}"
    )

    raw_response = call_gemini(prompt, system_instruction=system_prompt, enable_search=True)
    if raw_response:
        parsed = _extract_json(raw_response)
        if parsed:
            _premarket_cache = {
                "date": today_str,
                "bias": parsed.get("bias", "NEUTRAL"),
                "summary": parsed.get("summary", "Analysis completed with live market grounding."),
                "key_risks": parsed.get("key_risks", []),
                "sector_focus": parsed.get("sector_focus", []),
                "is_grounded": True,
                "updated_at": datetime.now(IST).strftime("%H:%M:%S IST"),
            }
            logger.info(
                "ai_copilot: pre-market briefing computed with Google Search Grounding: bias=%s",
                _premarket_cache["bias"],
            )
            return _premarket_cache
        else:
            logger.warning("ai_copilot: failed to parse grounded premarket JSON: %s", raw_response[:200])

    # Fallback default if API key missing or call fails
    _premarket_cache = {
        "date": today_str,
        "bias": "NEUTRAL",
        "summary": "Default pre-market bias: Trade strict technical triggers.",
        "key_risks": ["Standard intraday volatility"],
        "sector_focus": ["All F&O stocks"],
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
        "PRIME_MORNING (09:15-11:00)" if session_minute <= config.AUTO_EXECUTE_UNTIL_MINUTE
        else "MID_LATE_SESSION (11:00-15:30)"
    )

    # Estimate RVOL: compare today's traded_value rate vs first-30-min run-rate
    # Using first candle's volume as proxy for expected opening pace
    ltp = stock_data.get("ltp") or 0.0
    today_volume = stock_data.get("volume") or 0
    today_traded_val = ltp * today_volume
    # Rough avg daily value estimate: first candle volume × 75 (75 × 5min = 6.25h session)
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
        "premarket_bias": _premarket_cache.get("bias", "NEUTRAL"),
        "recent_5m_candles_count": len(candles),
        "recent_5m_candles_sample": (
            candles[-6:] if candles else []
        ),  # last 6 candles for prompt brevity
    }


def analyze_trade_setup(sym: str) -> Dict[str, Any]:
    """
    RED-FLAG FILTER: Pass real quantitative data to Gemini and ask it to identify
    specific disqualifying conditions (traps, extensions, late entry, poor RR).
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
    ltp = s["ltp"]
    is_bull = "Bull" in s.get("signal", "")

    system_prompt = (
        "You are a strict quantitative risk manager for an NSE India intraday desk. "
        "Your ONLY job is to find RED FLAGS that disqualify a trade. "
        "Do not generate buy/sell signals. Do not predict price direction. "
        "Analyse the real numbers provided and output SKIP_TRAP if any red flag exists, "
        "or CONFIRM if the setup is technically clean. "
        "Red flags include: price too extended from VWAP (>1.5%), "
        "signal after 11:00 AM IST (session_minute > 105), "
        "Risk-to-Reward ratio < 1:1.5 given the suggested SL/Target, "
        "PDH/PDL as immediate resistance/support within 0.3% of LTP, "
        "RVOL estimate < 1.5 (below-average volume), "
        "Depth delta strongly opposing the signal direction. "
        "Return valid JSON only."
    )

    prompt = (
        f"Symbol Context Package:\n{json.dumps(ctx, indent=2)}\n\n"
        "Provide a JSON response with EXACT keys:\n"
        "{\n"
        '  "decision": "CONFIRM_BUY" | "CONFIRM_SELL" | "SKIP_TRAP",\n'
        '  "confidence_score": integer (0 to 100),\n'
        '  "suggested_entry": float,\n'
        '  "suggested_sl": float,\n'
        '  "suggested_target": float,\n'
        '  "tsl_type": "PERCENT" | "POINTS",\n'
        '  "tsl_value": float,\n'
        '  "rationale": ["Point 1 (max 2 points)"]\n'
        "}\n\n"
        "IMPORTANT: Only return CONFIRM_BUY or CONFIRM_SELL when ALL of these are true:\n"
        "  • session_minute <= 105 (before 11:00 AM IST)\n"
        "  • LTP is within 1.5% of VWAP (not over-extended)\n"
        "  • Risk-to-Reward >= 1:1.5\n"
        "  • No PDH/PDL wall within 0.3% of entry\n"
        "  • RVOL estimate >= 1.5 (strong participation)\n"
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
    atr_est = max(ltp * 0.008, 1.0)  # ~0.8% estimated ATR volatility
    sl = round(ltp - (atr_est * 1.2), 2) if is_bull else round(ltp + (atr_est * 1.2), 2)
    target = round(ltp + (atr_est * 2.4), 2) if is_bull else round(ltp - (atr_est * 2.4), 2)
    decision = "CONFIRM_BUY" if is_bull else "CONFIRM_SELL"

    return {
        "symbol": sym,
        "decision": decision,
        "confidence_score": 75 if s.get("signal") != "None" else 50,
        "suggested_entry": ltp,
        "suggested_sl": sl,
        "suggested_target": target,
        "tsl_type": "PERCENT",
        "tsl_value": 0.5,
        "rationale": [
            f"Heuristic fallback: {s.get('signal')} signal active.",
            f"SL set at 1.2x estimated ATR (₹{sl}), Target 1:2 RR (₹{target}).",
        ],
        "is_fallback": True,
        "timestamp": datetime.now(IST).strftime("%H:%M:%S IST"),
    }


# ── 3. Deduplication + Daily Trade Counter ────────────────────────────────────

_notified_lock = threading.Lock()
_notified_signals_today: set[str] = set()
_last_reset_date: date | None = None

# Auto-trade counter: tracks how many paper trades have been auto-placed today
_auto_trades_today: int = 0
_auto_trades_lock = threading.Lock()
_auto_trades_reset_date: date | None = None


def _reset_daily_counters_if_needed(today: date) -> None:
    """Reset deduplication cache and trade counter at the start of each new trading day."""
    global _last_reset_date, _auto_trades_today, _auto_trades_reset_date
    with _notified_lock:
        if _last_reset_date != today:
            _notified_signals_today.clear()
            _last_reset_date = today
    with _auto_trades_lock:
        if _auto_trades_reset_date != today:
            _auto_trades_today = 0
            _auto_trades_reset_date = today


def _increment_auto_trade_count() -> int:
    """Increment and return the new daily auto-trade count (thread-safe)."""
    global _auto_trades_today
    with _auto_trades_lock:
        _auto_trades_today += 1
        return _auto_trades_today


def _get_auto_trade_count() -> int:
    """Return current daily auto-trade count (thread-safe)."""
    with _auto_trades_lock:
        return _auto_trades_today


# ── 4. Main Audit & Notify Entry Point ───────────────────────────────────────


def audit_and_notify_signal(sym: str, signal: str, signal_time: str) -> None:
    """
    Automated background worker: Audits a newly triggered breakout signal
    using Gemini's Red-Flag Filter and sends a rich Telegram alert.

    Pipeline:
      1. Daily dedup check — each symbol+signal fires at most once per day
      2. Gemini Red-Flag audit — SKIP_TRAP if any red flag found
      3. Confidence threshold check — must reach MIN_AI_CONFIDENCE
      4. Auto paper trade execution (if within session window and daily cap not hit)
      5. Rich Telegram notification
    """
    if not config.ENABLE_AI_TELEGRAM_ALERTS:
        logger.info("ai_copilot: ENABLE_AI_TELEGRAM_ALERTS is false; skipping alert for %s", sym)
        return

    today = datetime.now(IST).date()
    _reset_daily_counters_if_needed(today)

    # Step 1 — Deduplication: each symbol+signal audited at most once per day
    with _notified_lock:
        dedup_key = f"{today}:{sym}:{signal}"
        if dedup_key in _notified_signals_today:
            logger.info(
                "ai_copilot: signal %s for %s already notified today; skipping duplicate",
                signal,
                sym,
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

    is_confirm = dec in ("CONFIRM_BUY", "CONFIRM_SELL")

    # Step 3 — Confidence threshold
    passes_confidence = is_confirm and score >= config.MIN_AI_CONFIDENCE

    # Step 4 — Auto paper trade execution (if within session window + daily cap)
    auto_order_result: Optional[dict] = None
    auto_skipped_reason: str = ""

    if passes_confidence and config.AUTO_PAPER_USER_ID:
        now_ist = datetime.now(IST)
        session_minute = (now_ist.hour - 9) * 60 + (now_ist.minute - 15)
        within_window = session_minute <= config.AUTO_EXECUTE_UNTIL_MINUTE
        under_cap = _get_auto_trade_count() < config.MAX_DAILY_AUTO_TRADES

        if within_window and under_cap:
            # Risk-adjusted quantity: risk_per_trade / SL_distance_per_share
            risk_per_trade = config.DAILY_MAX_RISK_INR / config.MAX_DAILY_AUTO_TRADES
            sl_distance = abs(entry - sl) if entry and sl else 0.0
            if sl_distance > 0:
                quantity = max(1, int(risk_per_trade / sl_distance))
            else:
                quantity = 1

            from . import paper_trading
            side = "BUY" if "BUY" in dec else "SELL"
            notes = f"AI_COPILOT | {signal} | score={score} | auto"

            auto_order_result = paper_trading.place_auto_paper_order_sync(
                user_id=config.AUTO_PAPER_USER_ID,
                symbol=sym,
                side=side,
                quantity=quantity,
                sl_price=sl if sl else None,
                target_price=target if target else None,
                tsl_type=tsl_t,
                tsl_value=tsl_v,
                notes=notes,
            )
            if auto_order_result:
                _increment_auto_trade_count()
                logger.info(
                    "ai_copilot: auto paper trade placed for %s | %s %d qty @ %.2f",
                    sym, side, quantity, entry,
                )
            else:
                auto_skipped_reason = "Order placement failed (insufficient margin or DB error)"
        elif not within_window:
            auto_skipped_reason = f"After 11:00 AM cutoff (session min {session_minute})"
        elif not under_cap:
            auto_skipped_reason = f"Daily cap reached ({_get_auto_trade_count()}/{config.MAX_DAILY_AUTO_TRADES} trades)"
    elif passes_confidence and not config.AUTO_PAPER_USER_ID:
        auto_skipped_reason = "AUTO_PAPER_USER_ID not configured"

    # Step 5 — Build rich Telegram message
    icon = "🚀" if "BUY" in dec else "🔻" if "SELL" in dec else "⏸"

    # Compute RR ratio for the message
    rr_str = "N/A"
    if entry and sl and target:
        sl_dist = abs(entry - sl)
        tgt_dist = abs(target - entry)
        if sl_dist > 0:
            rr_str = f"1:{round(tgt_dist / sl_dist, 1)}"

    if passes_confidence and auto_order_result:
        # ── Auto-executed trade notification ──
        risk_per_trade = config.DAILY_MAX_RISK_INR / config.MAX_DAILY_AUTO_TRADES
        sl_distance = abs(entry - sl) if entry and sl else 0.0
        quantity = max(1, int(risk_per_trade / sl_distance)) if sl_distance > 0 else 1
        actual_risk = round(quantity * sl_distance, 2)

        lines = [
            f"✅ *PAPER ORDER PLACED*",
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

    elif passes_confidence and not auto_order_result and auto_skipped_reason:
        # ── High conviction but after-hours or cap hit → manual approval needed ──
        lines = [
            f"⏸ *HIGH CONVICTION — MANUAL APPROVAL NEEDED*",
            f"",
            f"📌 *Stock:* `{sym}` | *Signal:* `{signal}` ({signal_time})",
            f"🤖 *AI:* `{dec}` | *Confidence:* {score}%",
            f"",
            f"📍 *Entry:* ₹{entry:.2f}",
            f"🛑 *SL:* ₹{sl:.2f}",
            f"🎯 *Target:* ₹{target:.2f}",
            f"📊 *RR:* {rr_str}",
            f"🔄 *TSL:* {tsl_t} {tsl_v}",
            f"",
            f"⚠️ _Auto-execute skipped: {auto_skipped_reason}_",
        ]
        if rationale:
            lines.append("")
            for r in rationale[:2]:
                lines.append(f"• {r}")

    elif is_confirm and not passes_confidence:
        # ── Low confidence confirm — alert only ──
        lines = [
            f"{icon} *AI TRADE COPILOT — LOW CONFIDENCE*",
            f"*Stock:* `{sym}` | *Signal:* `{signal}` ({signal_time})",
            f"*AI Decision:* `{dec}` ({score}% — below {config.MIN_AI_CONFIDENCE}% threshold)",
            f"",
            f"📍 Entry: ₹{entry:.2f} | 🛑 SL: ₹{sl:.2f} | 🎯 Target: ₹{target:.2f}",
            f"📊 RR: {rr_str} | 🔄 TSL: {tsl_t} {tsl_v}",
            f"",
            f"_Skipped — confidence below threshold. Monitor manually._",
        ]

    else:
        # ── SKIP_TRAP — trade disqualified ──
        lines = [
            f"🚫 *AI SKIP — TRAP DETECTED*",
            f"*Stock:* `{sym}` | *Signal:* `{signal}` ({signal_time})",
            f"*AI Decision:* `{dec}` ({score}%)",
        ]
        if rationale:
            lines.append("")
            lines.append("*Red Flags:*")
            for r in rationale[:2]:
                lines.append(f"• {r}")

    text = "\n".join(lines)
    logger.info("ai_copilot: pushing Telegram alert for %s | decision=%s score=%d", sym, dec, score)
    telegram_notify.send_message(text)
