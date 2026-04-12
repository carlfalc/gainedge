

## Enhanced "My Profile" Dialog for Whisky & Cigar Lounge

### What We'll Build

Rebuild the `LoungeProfileDialog` with a richer form that includes:

1. **Name / Nickname toggle** — Pre-filled from profile. A toggle switch lets the user choose whether their name or nickname is shown in chat. Only one can be active at a time.

2. **Country selector** — A dropdown to select their country (full list of countries).

3. **Trading preferences** — Checkboxes for: Stocks, Forex Majors, Forex Minors, Commodities, Futures, Cryptocurrency, Indices, Gold.

4. **Favourite trading sessions** — Checkboxes for: Asia, London, Europe, New York.

5. **Save** persists all fields to the `profiles` table and controls what name appears in chat.

### Database Changes

Add new columns to the `profiles` table via migration:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS trading_preferences jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS favourite_sessions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_nickname boolean DEFAULT false;
```

- `country` — stores selected country code/name
- `trading_preferences` — JSON array of selected categories (e.g. `["forex_majors","gold","indices"]`)
- `favourite_sessions` — JSON array (e.g. `["asia","london"]`)
- `show_nickname` — when true, chat displays nickname instead of full name

### File Changes

| File | Action |
|------|--------|
| `profiles` table | Migration — add 4 columns |
| `src/components/dashboard/LoungeProfileDialog.tsx` | Rewrite — expanded form with all sections, scrollable, same gold/black theme |
| `src/components/dashboard/LoungeChat.tsx` | Minor update — use `show_nickname` flag to determine display name |
| `src/hooks/use-profile.ts` | Update `Profile` interface to include new fields |

### UI Layout (inside the dialog)

```text
┌─────────────────────────────────┐
│  MY PROFILE                  ×  │
│  ─────────────────────────────  │
│  Full Name    [prefilled     ]  │
│  Nickname     [prefilled     ]  │
│  Show in chat: ○ Name ○ Nick   │
│  ─────────────────────────────  │
│  Country      [▼ Select      ]  │
│  ─────────────────────────────  │
│  I Trade:                       │
│  ☑ Stocks  ☑ Forex Majors      │
│  ☐ Forex Minors  ☑ Commodities │
│  ☐ Futures  ☐ Cryptocurrency   │
│  ☑ Indices  ☑ Gold             │
│  ─────────────────────────────  │
│  Favourite Sessions:            │
│  ☑ Asia  ☐ London              │
│  ☑ Europe  ☐ New York          │
│  ─────────────────────────────  │
│  [ Save Profile ]               │
└─────────────────────────────────┘
```

The dialog will be scrollable if content overflows. Same gold/black aesthetic as current design.

