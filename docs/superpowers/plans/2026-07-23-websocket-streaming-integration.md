# WebSocket Real-Time Streaming Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create integration branch `feature/websocket-integration` off `main`, merge `feat/realtime-websocket-streaming` into it, run and pass backend (`pytest`) and frontend (`vitest`) test suites, and verify readiness for `main`.

**Architecture:** We use standard git branch integration (Option 1). `feature/websocket-integration` will be created at `main` HEAD (`387fdfed`), merged with `feat/realtime-websocket-streaming`, and verified via automated test suites.

**Tech Stack:** Git, Python 3.11 (pytest, FastAPI/Starlette WebSockets), Node.js (Vitest, React, Vite).

## Global Constraints

- Working branch for integration MUST be `feature/websocket-integration`.
- All backend tests in `backend/tests/test_broadcaster.py` MUST pass.
- All frontend tests in `frontend/src/store/marketStore.test.js` and `frontend/src/lib/rangeMap.test.js` MUST pass.

---

### Task 1: Create Integration Branch and Perform Git Merge

**Files:**
- Repository branches: `main`, `feat/realtime-websocket-streaming`, `feature/websocket-integration`

**Interfaces:**
- Consumes: `main` (commit `1b2dc08`) and `feat/realtime-websocket-streaming` (commit `e358823`).
- Produces: `feature/websocket-integration` branch containing all WebSocket broadcaster and reactive store code.

- [ ] **Step 1: Checkout main branch and verify status**

Run: `git checkout main && git status`
Expected: `On branch main, working tree clean`

- [ ] **Step 2: Create feature/websocket-integration branch from main**

Run: `git checkout -b feature/websocket-integration`
Expected: `Switched to a new branch 'feature/websocket-integration'`

- [ ] **Step 3: Merge feat/realtime-websocket-streaming into feature/websocket-integration**

Run: `git merge feat/realtime-websocket-streaming -m "merge: integrate WebSocket real-time delta streaming"`
Expected: `Merge made by the 'ort' strategy.` (18 files changed, 3357 insertions(+), 245 deletions(-))

---

### Task 2: Verify Backend Test Suite

**Files:**
- Test: `backend/tests/test_broadcaster.py`
- Source: `backend/app/broadcaster.py`, `backend/app/main.py`

**Interfaces:**
- Consumes: Broadcaster delta differ & WS endpoint implementations.
- Produces: Verified backend test results.

- [ ] **Step 1: Run pytest backend test suite**

Run: `python -m pytest backend/tests/test_broadcaster.py -v`
Expected: All tests pass (`PASSED`).

- [ ] **Step 2: Verify test output and coverage**

Run: `python -m pytest backend/tests/ -v`
Expected: All test modules pass with 0 errors.

---

### Task 3: Verify Frontend Test Suite

**Files:**
- Test: `frontend/src/store/marketStore.test.js`, `frontend/src/lib/rangeMap.test.js`
- Source: `frontend/src/store/marketStore.js`, `frontend/src/lib/rangeMap.js`

**Interfaces:**
- Consumes: Reactive market store & helper modules.
- Produces: Verified frontend unit test results.

- [ ] **Step 1: Run Vitest frontend test suite**

Run: `npm --prefix frontend test` (or `npx --prefix frontend vitest run`)
Expected: All test suites (`marketStore.test.js` and `rangeMap.test.js`) pass.

---

### Task 4: Final Integration Readiness Check & Documentation Update

**Files:**
- Modify: `docs/superpowers/plans/2026-07-23-websocket-streaming-integration.md` (check off steps)

**Interfaces:**
- Consumes: Completed tests on `feature/websocket-integration`.
- Produces: Integration branch ready for final review/merge into `main`.

- [ ] **Step 1: Check git status on feature/websocket-integration**

Run: `git status`
Expected: `On branch feature/websocket-integration, working tree clean`

- [ ] **Step 2: Log integration commits**

Run: `git log -n 5 --oneline`
Expected: Clean commit history showing the merge commit at HEAD.
