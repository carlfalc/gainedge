

## Problem: Signals Generated from Stale Mock Data

### Root Cause

The `compute-market-data` edge function falls back to `generateMockData()` when the MetaApi broker connection times out or fails. The mock base prices are **hardcoded and massively outdated**:

| Symbol | Mock Price | Real Price | Error |
|--------|-----------|------------|-------|
| US30 | 42,500 | ~48,500 | ~14% off |
| XAUUSD | 3,250 | ~4,800 | ~32% off |
| NAS100 | 21,200 | ~25,800 | ~22% off |

When the broker fetch fails, signals are generated against these fake prices, producing completely invalid entry/TP/SL levels and therefore incorrect WIN/LOSS results.

### Evidence

- Database `candle_history` shows real US30 at 48,560 and XAUUSD at 4,801 (Apr 15)
- The signals in your screenshot show US30 entry at 42,648 and XAUUSD at 3,266 — matching the mock base prices
- Lines 1053-1143 in `compute-market-data/index.ts` show the mock fallback path that triggers on broker timeout

### Proposed Fix

#### 1. Update mock base prices to current levels (immediate fix)
Update `generateMockData()` base prices to reflect April 2026 market levels:
- XAUUSD: 3250 → 4800
- US30: 42500 → 48500  
- NAS100: 21200 → 25800
- Other pairs as needed

#### 2. Block signal generation from mock data (proper fix)
Prevent signals from being created when using mock/fallback data. The system should only generate entry signals from verified live broker data. Mock data should only populate dashboard display (sparklines, approximate prices) but never trigger signal_outcomes entries.

Changes in `compute-market-data/index.ts`:
- Add a `isMock` flag to each symbol's data when it comes from `generateMockData()`
- Skip signal generation (the analysis block around lines 1359-1390) when `isMock === true`
- Log a warning instead: "Skipping signal generation for {symbol} — using mock data"

#### 3. Purge invalid signals
Create a one-time migration or script to delete/invalidate the signals that were generated from mock data (identifiable by entry prices matching stale mock ranges).

### Files to Change

- `supabase/functions/compute-market-data/index.ts` — Update mock prices, add isMock flag, block mock-based signal generation
- Database cleanup — Remove or mark invalid signal_outcomes generated from mock data

### Impact

This aligns with the existing project memory rule: *"Strict data integrity: Enforce live broker data, reject mock fallbacks."* The current code violates this principle by generating tradeable signals from mock data.

