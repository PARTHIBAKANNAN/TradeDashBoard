# Conviction Score Refactor — Single Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three sequential hard AND gates (Momentum >= 60 AND Entry Quality >= 60 AND AI Confidence >= 80) with a single composite conviction score and one threshold, so tightening any one dimension no longer causes zero trades.

**Architecture:** `compute_conviction_score(mom_score, eq_score, ai_confidence=None)` blends both scoring dimensions at 50/50 weight, with an optional ±10 pt AI confidence adjustment. The VWAP side check is demoted from a hard kill-switch (-1 return) to a 0-pt scoring outcome, so wrong-side entries lose 25 pts from entry quality rather than being vetoed entirely. A two-phase flow is preserved: base conviction (mom + eq) gates whether the AI thread is spawned; final conviction (with AI adjustment) gates execution.

**Tech Stack:** Python 3.11, existing scoring functions in `backend/app/technical_indicators.py`, pytest for tests

**Spec:** No separate spec file — design captured in this plan header and the task interfaces below.

## Global Constraints

- All changes are inside `backend/` only — no frontend files touched
- Do NOT change any sub-component scoring logic (RS points, freshness tiers, ATR tiers, BAG detection). Only the combination layer and veto logic changes.
- All existing tests must pass after each task (except `test_hard_vwap_veto` which is intentionally updated in Task 2)
- Run tests from `backend/` with: `python -m pytest tests/test_v2_scoring.py -v`
- Env var names are backward-compatible: old `MIN_MOMENTUM_SCORE` / `MIN_ENTRY_QUALITY_SCORE` remain in config for reference/logging; new `MIN_BASE_CONVICTION` and `MIN_FINAL_CONVICTION` are the active gates
- Python: `round()` uses banker's rounding — use `int(x + 0.5)` when you need standard 0.5 rounding

---

## File Map

| File | Change |
|------|--------|
| `backend/app/config.py` | Add `MIN_BASE_CONVICTION` (50) and `MIN_FINAL_CONVICTION` (55); keep old vars |
| `backend/app/technical_indicators.py` | (a) Remove hard-veto return from `calculate_entry_quality`; (b) Add `compute_conviction_score` function |
| `backend/app/calculations.py` | Replace line 383 AND gate with conviction score check |
| `backend/app/ai_copilot.py` | Remove hard confidence gate at line 705; pass `ai_confidence` into `compute_conviction_score` for final gate |
| `backend/tests/test_v2_scoring.py` | Update `test_hard_vwap_veto`; add `test_compute_conviction_score`; add `test_vwap_penalty_depresses_not_kills` |

---

### Task 1: Add New Config Thresholds

**Files:**
- Modify: `backend/app/config.py` (after line 98, alongside existing threshold vars)

**Interfaces:**
- Produces: `config.MIN_BASE_CONVICTION` (int, default 50), `config.MIN_FINAL_CONVICTION` (int, default 55)

- [ ] **Step 1: Open `backend/app/config.py` and locate the threshold block around line 92–98**

The block currently looks like:
```python
MIN_MOMENTUM_SCORE = int(os.getenv("MIN_MOMENTUM_SCORE", os.getenv("MIN_CONVICTION_SCORE", "60")))
MIN_ENTRY_QUALITY_SCORE = int(os.getenv("MIN_ENTRY_QUALITY_SCORE", "60"))
# Legacy alias for backwards compatibility
MIN_CONVICTION_SCORE = MIN_MOMENTUM_SCORE
```

- [ ] **Step 2: Add the two new threshold variables directly after line 98**

```python
# Single-gate conviction thresholds (replaces dual AND-gate).
# MIN_BASE_CONVICTION: pre-filter before spawning the AI audit thread.
#   Computed from mom_score + eq_score only (no AI yet). Lower than final
#   threshold to avoid rejecting borderline signals before AI sees them.
MIN_BASE_CONVICTION = int(os.getenv("MIN_BASE_CONVICTION", "50"))
#
# MIN_FINAL_CONVICTION: execution gate after AI confidence adjusts the score.
#   Set slightly higher than base to ensure AI approval is load-bearing.
MIN_FINAL_CONVICTION = int(os.getenv("MIN_FINAL_CONVICTION", "55"))
```

- [ ] **Step 3: Verify the file parses correctly**

```bash
cd backend && python -c "from app import config; print(config.MIN_BASE_CONVICTION, config.MIN_FINAL_CONVICTION)"
```
Expected output: `50 55`

- [ ] **Step 4: Commit**

```bash
git add backend/app/config.py
git commit -m "feat(config): add MIN_BASE_CONVICTION and MIN_FINAL_CONVICTION thresholds"
```

---

### Task 2: Demote VWAP Hard Veto to Weighted Penalty

**Files:**
- Modify: `backend/app/technical_indicators.py` lines 509–518
- Modify: `backend/tests/test_v2_scoring.py` — update `test_hard_vwap_veto`, add `test_vwap_penalty_depresses_not_kills`

**Interfaces:**
- Consumes: `calculate_entry_quality(stock, signal, ...)` — existing function signature unchanged
- Produces: `calculate_entry_quality` now returns a score in `[0, 100]` for all valid inputs. Returns `0` (not `-1`) when VWAP data is missing. Returns a reduced-but-positive score when LTP is on the wrong side of VWAP. The `-1` sentinel is **eliminated**.

> **Why this matters:** The rest of the codebase checks `if eq_score < 0` to detect the veto. After this task, those checks will never trigger. Task 5 cleans them up. Do NOT touch those checks yet — leave them as dead code until Task 5.

- [ ] **Step 1: Write the updated test first (TDD)**

In `backend/tests/test_v2_scoring.py`, replace the existing `test_hard_vwap_veto` function and add `test_vwap_penalty_depresses_not_kills`:

```python
def test_hard_vwap_veto():
    # Long setup when LTP is below VWAP — should score LOW but not return -1
    stock_bad_long = {"symbol": "NSE:TCS-EQ", "ltp": 3400.0, "vwap": 3420.0}
    score, factors, _ = calculate_entry_quality(
        stock=stock_bad_long,
        signal="Bull • C0.5",
        trigger_level=3410.0,
    )
    # Score must be a non-negative integer (veto demoted to penalty)
    assert score >= 0, f"Expected non-negative score (veto removed), got {score}"
    # Must be significantly depressed — loses the full 25-pt VWAP factor
    assert score <= 40, f"Expected depressed score <= 40 for wrong-side VWAP, got {score}"
    # Factor list must still contain a vwap_side entry explaining the penalty
    vwap_factor = next((f for f in factors if f["name"] == "vwap_side"), None)
    assert vwap_factor is not None, "Expected vwap_side factor in output"
    assert vwap_factor["pts"] == 0


def test_vwap_penalty_depresses_not_kills():
    # Short setup when LTP is above VWAP — same expectation
    stock_bad_short = {"symbol": "NSE:INFY-EQ", "ltp": 1650.0, "vwap": 1630.0}
    score, factors, _ = calculate_entry_quality(
        stock=stock_bad_short,
        signal="Bear • C0.5",
        trigger_level=1640.0,
    )
    assert score >= 0, f"Expected non-negative score, got {score}"
    assert score <= 40, f"Expected depressed score <= 40 for wrong-side VWAP short, got {score}"
```

- [ ] **Step 2: Run test to confirm it fails (existing code still returns -1)**

```bash
cd backend && python -m pytest tests/test_v2_scoring.py::test_hard_vwap_veto tests/test_v2_scoring.py::test_vwap_penalty_depresses_not_kills -v
```
Expected: FAIL — `AssertionError: Expected non-negative score (veto removed), got -1`

- [ ] **Step 3: Update `calculate_entry_quality` in `backend/app/technical_indicators.py`**

Find the VWAP hard veto block at lines ~509–518:

```python
    # ── HARD PRE-CONDITION: VWAP Side ─────────────────────────────────────────
    # Never buy below VWAP. Never short above VWAP. Hard veto = -1.
    if not vwap:
        return -1, [{"name": "vwap_side", "pts": 0, "max": 0, "detail": "No VWAP data"}], {}
    if is_bull and ltp < vwap:
        return -1, [{"name": "vwap_side", "pts": 0, "max": 25,
                      "detail": f"LTP {ltp:.2f} below VWAP {vwap:.2f}"}], {}
    if not is_bull and ltp > vwap:
        return -1, [{"name": "vwap_side", "pts": 0, "max": 25,
                      "detail": f"LTP {ltp:.2f} above VWAP {vwap:.2f}"}], {}
```

Replace with:

```python
    # ── VWAP Side Check ────────────────────────────────────────────────────────
    # Wrong-side entries score 0 on the VWAP factor (25-pt penalty) but are not
    # hard-vetoed. Extraordinary momentum can still overcome the deficit.
    vwap_wrong_side = False
    if not vwap:
        # No VWAP data — treat as neutral (0 pts, no penalty flag)
        factors.append({"name": "vwap_side", "pts": 0, "max": 25, "detail": "No VWAP data"})
        vwap_wrong_side = True
    elif is_bull and ltp < vwap:
        factors.append({"name": "vwap_side", "pts": 0, "max": 25,
                        "detail": f"LTP {ltp:.2f} below VWAP {vwap:.2f} (wrong side)"})
        vwap_wrong_side = True
    elif not is_bull and ltp > vwap:
        factors.append({"name": "vwap_side", "pts": 0, "max": 25,
                        "detail": f"LTP {ltp:.2f} above VWAP {vwap:.2f} (wrong side)"})
        vwap_wrong_side = True
    # If wrong side: skip the VWAP distance factor entirely (already scored 0 above).
    # If correct side: VWAP distance factor is scored below in its normal position.
```

> **Important:** The code block that follows awards 3–25 pts for VWAP *distance* only when LTP is on the correct side. You must wrap that existing VWAP distance scoring block in `if not vwap_wrong_side:` so it is skipped when wrong side is detected. Find the VWAP distance scoring block (it's Factor 3, awarding pts based on `vwap_dist_pct`) and add that guard around it. Do not change the points inside.

- [ ] **Step 4: Find and guard the VWAP distance factor block**

The VWAP distance scoring block in `calculate_entry_quality` starts with something like:
```python
    # ── Factor 3: VWAP Alignment & Distance (max 25 pts) ──────────────────────
```
Wrap the entire Factor 3 block:
```python
    if not vwap_wrong_side:
        # ── Factor 3: VWAP Alignment & Distance (max 25 pts) ──────────────────────
        # ... (existing code unchanged) ...
```

- [ ] **Step 5: Also update the legacy veto guard two levels up in `validate_quant_filters` (line ~681)**

Find in `technical_indicators.py`:
```python
    if eq_score < 0:
        return -1, eq_factors, {**mom_metrics, **eq_metrics}
```
Replace with:
```python
    # eq_score < 0 is no longer produced; guard kept for safety during transition
    if eq_score < 0:
        eq_score = 0
```

- [ ] **Step 6: Run tests**

```bash
cd backend && python -m pytest tests/test_v2_scoring.py -v
```
Expected: All tests PASS including the updated `test_hard_vwap_veto` and new `test_vwap_penalty_depresses_not_kills`

- [ ] **Step 7: Commit**

```bash
git add backend/app/technical_indicators.py backend/tests/test_v2_scoring.py
git commit -m "feat(scoring): demote VWAP hard veto to 25-pt penalty in entry quality score"
```

---

### Task 3: Add `compute_conviction_score` Function

**Files:**
- Modify: `backend/app/technical_indicators.py` — add function after `calculate_entry_quality` (before `validate_quant_filters`)
- Modify: `backend/tests/test_v2_scoring.py` — add `test_compute_conviction_score`

**Interfaces:**
- Produces:
  ```python
  def compute_conviction_score(
      mom_score: int,
      eq_score: int,
      ai_confidence: Optional[int] = None,
  ) -> int:
      """Returns 0-100 composite conviction score."""
  ```
- Later tasks call this function from `calculations.py` and `ai_copilot.py`

> **Note:** The test file already imports `compute_conviction_score` from `app.technical_indicators` (line 10 of `test_v2_scoring.py`). If this function is missing, the entire test file fails on import. Confirm this is the case first, then implement.

- [ ] **Step 1: Confirm import currently fails**

```bash
cd backend && python -m pytest tests/test_v2_scoring.py -v 2>&1 | head -20
```
If you see `ImportError: cannot import name 'compute_conviction_score'`, proceed. If it already exists, read the existing implementation before proceeding.

- [ ] **Step 2: Write the failing test**

Add to `backend/tests/test_v2_scoring.py`:

```python
def test_compute_conviction_score():
    # Both strong → high conviction
    assert compute_conviction_score(80, 80) == 80

    # Both at old threshold (60/60) → should pass new base threshold of 50
    assert compute_conviction_score(60, 60) == 60

    # One strong, one weak — average, not kill
    result = compute_conviction_score(80, 40)
    assert result == 60, f"Expected 60 for (80, 40), got {result}"

    # AI confidence 100 adds +10 pts
    result_with_ai = compute_conviction_score(60, 60, ai_confidence=100)
    assert result_with_ai == 70, f"Expected 70 for (60,60) + ai=100, got {result_with_ai}"

    # AI confidence 50 → 0 adjustment (neutral)
    result_neutral = compute_conviction_score(60, 60, ai_confidence=50)
    assert result_neutral == 60, f"Expected 60 for (60,60) + ai=50, got {result_neutral}"

    # AI confidence 0 subtracts 10 pts
    result_low_ai = compute_conviction_score(60, 60, ai_confidence=0)
    assert result_low_ai == 50, f"Expected 50 for (60,60) + ai=0, got {result_low_ai}"

    # Clamps to 0 floor
    assert compute_conviction_score(0, 0, ai_confidence=0) == 0

    # Clamps to 100 ceiling
    assert compute_conviction_score(100, 100, ai_confidence=100) == 100
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd backend && python -m pytest tests/test_v2_scoring.py::test_compute_conviction_score -v
```
Expected: FAIL with ImportError or NameError

- [ ] **Step 4: Implement `compute_conviction_score` in `technical_indicators.py`**

Add this function after `calculate_entry_quality` ends (before `validate_quant_filters` at line ~696):

```python
def compute_conviction_score(
    mom_score: int,
    eq_score: int,
    ai_confidence: Optional[int] = None,
) -> int:
    """
    Combine momentum and entry quality into a single 0-100 conviction score.

    Weights: 50% momentum, 50% entry quality.
    AI confidence (0-100) applies a ±10 pt linear adjustment when provided:
      ai=100 → +10 pts, ai=50 → 0 pts, ai=0 → -10 pts.
    Result is clamped to [0, 100].
    """
    base = (mom_score * 0.50) + (eq_score * 0.50)

    if ai_confidence is not None:
        # Linear map: 50 → 0, 100 → +10, 0 → -10
        ai_adj = (ai_confidence - 50) / 5.0
        base = base + ai_adj

    return min(100, max(0, int(base + 0.5)))
```

- [ ] **Step 5: Run all tests**

```bash
cd backend && python -m pytest tests/test_v2_scoring.py -v
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/technical_indicators.py backend/tests/test_v2_scoring.py
git commit -m "feat(scoring): add compute_conviction_score — 50/50 blend with AI confidence adjustment"
```

---

### Task 4: Replace AND Gate in `calculations.py`

**Files:**
- Modify: `backend/app/calculations.py` lines 380–440

**Interfaces:**
- Consumes: `compute_conviction_score(mom_score, eq_score)` from `technical_indicators`
- Consumes: `config.MIN_BASE_CONVICTION` (int)
- Produces: `passes_eval` based on `base_conviction >= min_base_conviction`; stores `base_conviction` on `stock` dict for AI thread to consume

- [ ] **Step 1: Read the full gate block in `calculations.py` lines 379–441 before editing**

Understand exactly what `stock` dict fields are set when `passes_eval` is True (lines 396–401).

- [ ] **Step 2: Write a test for the gate logic**

Add to `backend/tests/test_v2_scoring.py`:

```python
def test_conviction_gate_replaces_and_gate():
    """Verify that (mom=65, eq=55) passes base conviction gate but would have failed old AND gate."""
    # Old AND gate: 65 >= 60 AND 55 >= 60 → FAIL (55 < 60)
    # New conviction: (65*0.5 + 55*0.5) = 60 >= 50 → PASS
    result = compute_conviction_score(65, 55)
    assert result == 60
    assert result >= 50, "Should pass base conviction threshold of 50"

    # Verify truly weak signals still fail
    weak = compute_conviction_score(40, 30)
    assert weak == 35
    assert weak < 50, "Weak signal should not pass base conviction threshold"
```

- [ ] **Step 3: Run test**

```bash
cd backend && python -m pytest tests/test_v2_scoring.py::test_conviction_gate_replaces_and_gate -v
```
Expected: PASS (no code change needed — tests the math only)

- [ ] **Step 4: Update `calculations.py` — replace the AND gate**

Find lines 380–408 in `calculations.py`. The current code is:

```python
                min_mom = getattr(_cfg, "MIN_MOMENTUM_SCORE", 60)
                min_eq = getattr(_cfg, "MIN_ENTRY_QUALITY_SCORE", 60)

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
```

Replace with:

```python
                min_base = getattr(_cfg, "MIN_BASE_CONVICTION", 50)

                from .technical_indicators import compute_conviction_score as _conv
                base_conviction = _conv(mom_score, eq_score)
                passes_eval = base_conviction >= min_base

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
                    stock["base_conviction"] = base_conviction
                    stock["conviction_score"] = base_conviction
                    stock["conviction_factors"] = mom_factors + eq_factors
```

- [ ] **Step 5: Update the rejection logging block (lines ~419–440) to log conviction score**

Find:
```python
                else:
                    rejection_reasons = []
                    if eq_score < 0:
                        rejection_reasons.append("Hard VWAP Veto")
                    else:
                        if mom_score < min_mom:
                            weak_mom = [f["name"] for f in mom_factors if f["pts"] < f["max"] * 0.4]
                            rejection_reasons.append(f"Momentum {mom_score}/{min_mom} (weak: {', '.join(weak_mom[:2]) or 'drag'})")
                        if eq_score < min_eq:
                            weak_eq = [f["name"] for f in eq_factors if f["pts"] < f["max"] * 0.4]
                            rejection_reasons.append(f"Entry Quality {eq_score}/{min_eq} (weak: {', '.join(weak_eq[:2]) or 'extended'})")

                    logger.info(
                        "[V2 EVAL] REJECTED %s | Signal: %s | Time: %s\n"
                        "  • MOMENTUM: %d/%d [%s]\n"
                        "  • ENTRY QUALITY: %d/%d [%s]\n"
                        "  • REASON: %s",
                        short_sym, signal, signal_time,
                        mom_score, min_mom, mom_summary,
                        eq_score, min_eq, eq_summary,
                        " | ".join(rejection_reasons),
                    )
```

Replace with:

```python
                else:
                    weak_mom = [f["name"] for f in mom_factors if f["pts"] < f["max"] * 0.4]
                    weak_eq = [f["name"] for f in eq_factors if f["pts"] < f["max"] * 0.4]
                    rejection_reasons = [
                        f"Conviction {base_conviction}/{min_base}",
                        f"weak momentum factors: {', '.join(weak_mom[:2]) or 'none'}",
                        f"weak entry factors: {', '.join(weak_eq[:2]) or 'none'}",
                    ]

                    logger.info(
                        "[V2 EVAL] REJECTED %s | Signal: %s | Time: %s\n"
                        "  • MOMENTUM: %d/100 [%s]\n"
                        "  • ENTRY QUALITY: %d/100 [%s]\n"
                        "  • CONVICTION: %d/%d\n"
                        "  • REASON: %s",
                        short_sym, signal, signal_time,
                        mom_score, mom_summary,
                        eq_score, eq_summary,
                        base_conviction, min_base,
                        " | ".join(rejection_reasons),
                    )
```

- [ ] **Step 6: Run all tests**

```bash
cd backend && python -m pytest tests/test_v2_scoring.py -v
```
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/calculations.py backend/tests/test_v2_scoring.py
git commit -m "feat(gate): replace AND gate with single base_conviction threshold in calculations.py"
```

---

### Task 5: Refactor AI Confidence Gate in `ai_copilot.py`

**Files:**
- Modify: `backend/app/ai_copilot.py` lines 702–711

**Interfaces:**
- Consumes: `compute_conviction_score(mom_score, eq_score, ai_confidence)` from `technical_indicators`
- Consumes: `config.MIN_FINAL_CONVICTION` (int)
- Consumes: `stock["base_conviction"]` (int) set by Task 4
- Produces: `passes_final` (bool) — replaces `passes_confidence`; execution proceeds only when `final_conviction >= MIN_FINAL_CONVICTION`

> **Context:** `audit_and_notify_signal` is called in a background thread. It already has access to `sym` (the stock symbol). The `stock` dict set in Task 4 is shared state — the function needs to retrieve `base_conviction` from the live stock dict. Look at how `analyze_trade_setup(sym)` fetches data to understand how to retrieve `base_conviction` at this point.

- [ ] **Step 1: Read `ai_copilot.py` lines 655–720 in full before editing**

Understand the flow from `audit_and_notify_signal` entry point through `analyze_trade_setup` call to the confidence check at line 705. Note how `sym` maps to the stock dict used in `calculations.py`.

- [ ] **Step 2: Write a unit test**

Add to `backend/tests/test_v2_scoring.py`:

```python
def test_final_conviction_with_ai():
    """AI confidence 85 should push borderline conviction over final threshold."""
    # base conviction = 52 (borderline — passes base 50, fails if no AI boost)
    base = compute_conviction_score(55, 49)
    assert base == 52

    # With AI confidence 85: adj = (85-50)/5 = +7 → final = 59
    final = compute_conviction_score(55, 49, ai_confidence=85)
    assert final == 59
    assert final >= 55, "Should pass MIN_FINAL_CONVICTION=55 with strong AI"

    # With AI confidence 20: adj = (20-50)/5 = -6 → final = 46
    final_low = compute_conviction_score(55, 49, ai_confidence=20)
    assert final_low == 46
    assert final_low < 55, "Should fail MIN_FINAL_CONVICTION=55 with weak AI"
```

- [ ] **Step 3: Run test**

```bash
cd backend && python -m pytest tests/test_v2_scoring.py::test_final_conviction_with_ai -v
```
Expected: PASS (tests the math from Task 3's implementation)

- [ ] **Step 4: Update `ai_copilot.py` — replace hard confidence gate**

Find lines 702–711 in `ai_copilot.py`:

```python
    is_confirm = ("BUY" in dec.upper() or "SELL" in dec.upper()) and "SKIP" not in dec.upper()

    # Step 3 — Confidence threshold
    passes_confidence = is_confirm and score >= config.MIN_AI_CONFIDENCE

    # Step 4 — Auto paper trade execution (if within session window + daily cap)
    auto_order_result: Optional[dict] = None
    auto_skipped_reason: str = ""

    if passes_confidence and config.AUTO_PAPER_USER_ID:
```

Replace with:

```python
    is_confirm = ("BUY" in dec.upper() or "SELL" in dec.upper()) and "SKIP" not in dec.upper()

    # Step 3 — Final conviction gate: blend AI confidence into the base conviction score
    # base_conviction was computed in calculations.py and stored on the stock dict.
    # Retrieve it; fall back to 50 (neutral) if unavailable.
    from .technical_indicators import compute_conviction_score as _conv
    _stock_snapshot = _get_stock_snapshot(sym)  # existing helper — returns live stock dict or {}
    base_conviction = _stock_snapshot.get("base_conviction", 50) if _stock_snapshot else 50

    ai_confidence_value = score if is_confirm else 0
    final_conviction = _conv(
        _stock_snapshot.get("momentum_score", 50) if _stock_snapshot else 50,
        _stock_snapshot.get("entry_quality_score", 50) if _stock_snapshot else 50,
        ai_confidence=ai_confidence_value,
    )
    passes_final = final_conviction >= config.MIN_FINAL_CONVICTION

    # Step 4 — Auto paper trade execution (if within session window + daily cap)
    auto_order_result: Optional[dict] = None
    auto_skipped_reason: str = ""

    if passes_final and config.AUTO_PAPER_USER_ID:
```

> **IMPORTANT:** You must also replace all remaining references to `passes_confidence` in this function with `passes_final`. Search the rest of `audit_and_notify_signal` for `passes_confidence` and rename each one. There are references in the Telegram message block and in the `elif passes_confidence and not config.AUTO_PAPER_USER_ID` branch.

> **`_get_stock_snapshot`:** Check whether this helper already exists in `ai_copilot.py`. If it does not exist, look for how `analyze_trade_setup(sym)` retrieves the current stock state. You may need to add a small helper that looks up the current in-memory stock dict by symbol — or inline the lookup. Do not add a new database call.

- [ ] **Step 5: Update logging in `audit_and_notify_signal` to reflect conviction**

Find the logger call that currently logs `"AI gate: confidence %d"` or similar. Update it to log both `base_conviction` and `final_conviction`:

```python
    logger.info(
        "ai_copilot: conviction gate | %s | base=%d final=%d threshold=%d | passes=%s",
        sym, base_conviction, final_conviction, config.MIN_FINAL_CONVICTION, passes_final,
    )
```

- [ ] **Step 6: Run full test suite**

```bash
cd backend && python -m pytest tests/ -v
```
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/ai_copilot.py backend/tests/test_v2_scoring.py
git commit -m "feat(gate): replace AI hard confidence gate with conviction-score adjustment in ai_copilot"
```

---

### Task 6: Update `validate_quant_filters` Legacy Shim

**Files:**
- Modify: `backend/app/technical_indicators.py` lines 696–731 (`validate_quant_filters`)

**Interfaces:**
- Consumes: `compute_conviction_score(mom_score, eq_score)` — defined in Task 3
- Consumes: `config.MIN_BASE_CONVICTION`
- Produces: `validate_quant_filters` returns `(True, reason_str, metrics)` using conviction score; backward-compatible signature unchanged

- [ ] **Step 1: Update the test for `validate_quant_filters`**

The existing `test_combined_conviction_and_legacy_shim` in `test_v2_scoring.py` already passes. Update its assertion to be conviction-aware:

```python
def test_combined_conviction_and_legacy_shim():
    all_stocks = [
        {"symbol": "NSE:TATASTEEL-EQ", "ltp": 155.0, "vwap": 154.2, "relative_strength": 1.15, "depth_delta": 300},
    ]
    closes = [150.0 + i * 0.3 for i in range(25)]

    passes, reason, metrics = validate_quant_filters(
        stock=all_stocks[0],
        signal="Bull • C0.5",
        all_stocks=all_stocks,
        candle_closes=closes,
    )
    assert passes is True
    assert "conviction" in reason.lower() or "Momentum" in reason, f"Unexpected reason: {reason}"
    assert "conviction_score" in metrics
    assert metrics["conviction_score"] >= 50
```

- [ ] **Step 2: Run test to confirm it currently fails (metrics won't have conviction_score yet)**

```bash
cd backend && python -m pytest tests/test_v2_scoring.py::test_combined_conviction_and_legacy_shim -v
```

- [ ] **Step 3: Rewrite `validate_quant_filters` to use conviction score**

Replace the full function body (lines 703–731) with:

```python
def validate_quant_filters(
    stock: dict,
    signal: str,
    all_stocks: List[dict],
    candle_closes: List[float],
) -> Tuple[bool, str, Dict[str, float]]:
    """Delegates to the dual scorer then applies MIN_BASE_CONVICTION threshold."""
    from . import config as _cfg

    mom_score, mom_factors, mom_metrics = rank_universe_momentum(
        stock=stock, signal=signal, all_stocks=all_stocks, candle_closes=candle_closes,
    )
    ltp = stock.get("ltp") or 0.0
    eq_score, eq_factors, eq_metrics = calculate_entry_quality(
        stock=stock, signal=signal, trigger_level=ltp,
    )
    # eq_score < 0 no longer produced after Task 2; guard kept for safety
    if eq_score < 0:
        eq_score = 0

    conviction = compute_conviction_score(mom_score, eq_score)
    min_base = getattr(_cfg, "MIN_BASE_CONVICTION", 50)

    metrics = {
        **mom_metrics,
        **eq_metrics,
        "conviction_score": conviction,
        "momentum_score": mom_score,
        "entry_quality_score": eq_score,
    }

    if conviction >= min_base:
        return True, f"Conviction {conviction}/100 (Momentum {mom_score}, Entry Quality {eq_score})", metrics

    reasons = []
    if mom_score < 50:
        reasons.append(f"Low momentum ({mom_score}/100)")
    if eq_score < 50:
        reasons.append(f"Poor entry quality ({eq_score}/100)")
    reasons.append(f"Conviction {conviction} < {min_base}")
    return False, ", ".join(reasons), metrics
```

- [ ] **Step 4: Run all tests**

```bash
cd backend && python -m pytest tests/test_v2_scoring.py -v
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/technical_indicators.py backend/tests/test_v2_scoring.py
git commit -m "refactor(scoring): update validate_quant_filters to use compute_conviction_score"
```

---

### Task 7: Final Smoke Test & Cleanup

**Files:**
- Read-only audit of `backend/app/calculations.py` and `backend/app/ai_copilot.py`

**Goal:** Confirm no orphaned references to the old AND gate pattern remain.

- [ ] **Step 1: Search for orphaned references**

```bash
cd backend && grep -n "passes_confidence\|eq_score < 0\|min_mom\|min_eq\|MIN_MOMENTUM_SCORE.*gate\|MIN_ENTRY_QUALITY_SCORE.*gate" app/calculations.py app/ai_copilot.py app/technical_indicators.py
```

For each hit:
- `passes_confidence` in `ai_copilot.py` → should be zero hits (all renamed to `passes_final` in Task 5)
- `eq_score < 0` → only allowed in the safety guard added in Task 2 and Task 6
- `min_mom` / `min_eq` in `calculations.py` → should be zero hits (removed in Task 4)
- `MIN_MOMENTUM_SCORE.*gate` / `MIN_ENTRY_QUALITY_SCORE.*gate` → should be zero hits

Fix any hits found.

- [ ] **Step 2: Run full test suite one final time**

```bash
cd backend && python -m pytest tests/ -v
```
Expected: All tests PASS with no warnings about deprecated gates

- [ ] **Step 3: Final commit**

```bash
git add backend/app/calculations.py backend/app/ai_copilot.py backend/app/technical_indicators.py
git commit -m "chore(cleanup): remove orphaned AND-gate references after conviction score refactor"
```

---

## Summary of Behavioral Changes After This Plan

| Before | After |
|--------|-------|
| mom >= 60 AND eq >= 60 | conviction = (mom×0.5 + eq×0.5) >= 50 |
| VWAP wrong side → -1 (trade killed) | VWAP wrong side → -25 pts to eq score |
| AI confidence >= 80 → separate hard gate | AI confidence adjusts final conviction by ±10 pts |
| 3 compounding gates | 2 thresholds (base 50, final 55) |
| mom=65, eq=55 → REJECTED | conviction=60 >= 50 → QUALIFIES for AI review |
| mom=80, VWAP wrong side → KILLED | eq penalized by 25pts; if mom is strong enough, AI still sees it |
| Gemini SKIP_TRAP still executes if scores high | Gemini SKIP_TRAP → ai_confidence=0 → -10pts → often fails final gate |
