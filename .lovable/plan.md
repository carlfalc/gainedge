

# Remove Low-Impact News from Market Sentiment

## Problem
Low-impact news items with no matched instruments are still being stored and displayed in the Market Sentiment panel. These add noise without value.

## Changes

### 1. Tighten insert filter (`supabase/functions/fetch-news/index.ts`)
Update `shouldInsertNewsItem()` (~line 209) to explicitly reject items where `impact === "low"` and `instruments_affected` is empty. The current logic already does this implicitly but we make it explicit and also reject `impact === "low"` entirely — low-impact items should never be stored.

### 2. Tighten display filter (`src/components/dashboard/NewsSentimentPanel.tsx`)
Update the safety-net filter (~line 120) to exclude any item with `severity === "low"`. Only show medium and high impact items in the panel.

### 3. Add cleanup for existing low-impact items
The existing cleanup block in the edge function should also delete any items with `impact = 'low'` regardless of age, to purge existing low-impact noise from the database.

## Files Modified
| File | Change |
|------|--------|
| `supabase/functions/fetch-news/index.ts` | Reject all low-impact items in `shouldInsertNewsItem()`; extend cleanup to delete low-impact rows |
| `src/components/dashboard/NewsSentimentPanel.tsx` | Filter out `severity === "low"` items from display |

