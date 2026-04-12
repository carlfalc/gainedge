

# Fix Signals Page Layout — Stretch Table & P&L Column

## Problem
The signal table uses fixed pixel-width columns totalling ~810px, leaving large amounts of unused space on wider screens. The P&L column (100px) is too narrow, causing the currency amounts to wrap awkwardly.

## Changes

### 1. Update table grid columns (`SignalsPage.tsx`)
- Change the grid template from fixed pixels (`140px 90px 60px 50px 80px 80px 80px 50px 80px 100px`) to a mix of fixed minimums and flexible columns
- Use `minmax()` for the P&L column so it gets the remaining space — e.g. `140px 90px 60px 50px 90px 90px 90px 50px 80px 1fr`
- Apply this to both the header row (line 354) and the data rows (line 373)

### 2. Ensure stat tiles remain full-width
- The stat tiles already use `repeat(5, 1fr)` which stretches correctly — no change needed there

## Files Modified
| File | Change |
|------|--------|
| `src/pages/dashboard/SignalsPage.tsx` | Change grid template columns to use `1fr` for P&L column so table fills available width |

