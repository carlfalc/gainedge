

## Plan: Unify RON Engine Values Platform-Wide

### The Bug
The same database column (`user_signal_preferences.signal_engine`) is being written with **two incompatible value formats** by different UI components:

| Component | Writes Values | Has "Combined" option? |
|-----------|--------------|------------------------|
| `RonVersionSelector` (Settings sidebar + Charts) | `v1_legacy`, `v2_knowledge` | No |
| `FalconerPreferencesPanel` (Settings main) | `v1`, `v2`, `v1v2` | Yes |
| `SignalsPage` tabs | `v1`, `v2`, `v1v2` | Yes |
| `TradingViewChartPage` display | reads `v1_legacy`, `v2_knowledge` | No |
| Backend `compute-market-data` | expects `v1`, `v2`, `v1v2` | Yes |

**Result:** When the user picks "RON V1 Legacy" via the RonVersionSelector card, the DB stores `"v1_legacy"`. The Signals page can't match that string against any tab, falls back to its default `v1v2`, and shows "V1 + V2" highlighted — which is what the user reported.

### Canonical Format (chosen)
Standardize on `"v1"`, `"v2"`, `"v1v2"` everywhere. Reasons:
- Backend already uses this format — no edge function changes needed
- It supports the third "Combined" option that the user has been using on the Signals page
- Shorter, simpler

### Changes

**1. `src/components/dashboard/RonVersionSelector.tsx`**
- Change `RonVersion` type from `"v1_legacy" | "v2_knowledge"` to `"v1" | "v2" | "v1v2"`
- Update read logic: map any legacy `v1_legacy`/`v2_knowledge` values from DB to `v1`/`v2` for backward compatibility
- Add a third card or button row entry for "V1 + V2 Combined" so this selector matches the other two surfaces
- Update all internal comparisons (`activeVersion === "v1_legacy"` → `=== "v1"`, etc.)

**2. `src/pages/dashboard/TradingViewChartPage.tsx`**
- Update the display condition `ronVersion === "v1_legacy"` to handle `v1`, `v2`, `v1v2`
- Show: "RON V1 Legacy", "RON V2 Knowledge Base", or "RON V1 + V2 Combined"

**3. One-time DB cleanup migration**
- `UPDATE user_signal_preferences SET signal_engine = 'v1' WHERE signal_engine = 'v1_legacy';`
- `UPDATE user_signal_preferences SET signal_engine = 'v2' WHERE signal_engine = 'v2_knowledge';`
- This fixes existing users who already have stale values stored

**4. No changes needed to:**
- `FalconerPreferencesPanel` — already on the canonical format
- `SignalsPage` — already on the canonical format
- `compute-market-data` edge function — already uses canonical format
- `FalconerRulesPanel` / `FalconerPerformancePanel` — only read for display

### Outcome
After this change, picking "V1 Legacy" anywhere on the platform (Settings sidebar card, Settings main panel, Signals page tab, or Charts page) writes the same value, and **all four surfaces will show the same active selection**. The selection becomes a single source of truth, exactly as the user expects.

### Files Modified
| File | Change |
|------|--------|
| `src/components/dashboard/RonVersionSelector.tsx` | Switch values to `v1`/`v2`/`v1v2`, add Combined card, map legacy values on load |
| `src/pages/dashboard/TradingViewChartPage.tsx` | Handle all 3 values in display label |
| New SQL migration | Backfill existing `v1_legacy`/`v2_knowledge` rows to `v1`/`v2` |

