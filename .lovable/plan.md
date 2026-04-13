

## Language / Internationalization (i18n) Plan

### Current State
The `LanguageSelector` component saves a language code (e.g. `"de"`, `"fr"`) to localStorage and exposes it via `useLanguage()`. However, `useLanguage` is only imported inside `LanguageSelector.tsx` itself — no other component reads the language to translate UI text. The selector works, but the platform stays in English regardless of selection.

### Options for Real Translation

There are two practical approaches:

#### Option A: Static Translation Files (i18next) — Recommended
Use `react-i18next`, the standard React internationalization library. Every UI string gets a translation key, and JSON files provide translations per language.

- **Pros**: Fast, no API costs, works offline, industry standard
- **Cons**: We must provide/generate translation JSON files for all 10 languages (~200-400 UI strings). We can use AI to generate initial translations, then refine.
- **How it works**: `t("settings.title")` → looks up the current language's JSON → returns `"Einstellungen"` (German) or `"Settings"` (English)

#### Option B: Live AI Translation (Runtime)
Call a translation API on-the-fly when language changes, caching results.

- **Pros**: Zero manual translation files, always up to date
- **Cons**: Adds latency on every language switch, API costs, requires network, harder to QA

### Recommended Approach: Option A (i18next)

**Step 1 — Install & configure i18next**
- Add `react-i18next` and `i18next` packages
- Create `src/i18n/index.ts` with language detection from localStorage
- Wire `LanguageProvider` to sync with i18next's language

**Step 2 — Create translation files**
- `src/i18n/locales/en.json` (English — the baseline, extracted from current hardcoded strings)
- One JSON file per language: `es.json`, `fr.json`, `de.json`, `pt.json`, `ja.json`, `zh.json`, `ar.json`, `hi.json`, `ko.json`
- Use AI to generate initial translations from the English file

**Step 3 — Replace hardcoded strings in key pages**
Priority pages to translate first:
1. **DashboardHome** — welcome text, card labels
2. **SettingsPage** — all section headers, toggle labels, button text
3. **SignalsPage** — table headers, status labels
4. **Sidebar/Navigation** — menu items
5. **Login/Signup** — form labels, buttons

Each hardcoded string like `"Settings"` becomes `t("nav.settings")`.

**Step 4 — RTL support for Arabic**
- Add `dir="rtl"` to the root element when Arabic is selected
- Tailwind has built-in RTL utilities

### Scope & Effort
- ~300-400 translatable strings across the app
- Initial implementation: sidebar + settings + dashboard home + login/signup
- Remaining pages can be translated incrementally

### Files to Create
| File | Purpose |
|------|---------|
| `src/i18n/index.ts` | i18next configuration |
| `src/i18n/locales/en.json` | English strings (baseline) |
| `src/i18n/locales/{lang}.json` × 9 | Translated strings per language |

### Files to Modify
| File | Change |
|------|--------|
| `src/main.tsx` | Import i18n init |
| `src/components/dashboard/LanguageSelector.tsx` | Sync language change with `i18next.changeLanguage()` |
| `src/components/dashboard/DashboardLayout.tsx` | Replace hardcoded nav labels with `t()` |
| `src/pages/dashboard/SettingsPage.tsx` | Replace hardcoded labels with `t()` |
| `src/pages/dashboard/DashboardHome.tsx` | Replace hardcoded text with `t()` |
| `src/pages/Login.tsx` / `src/pages/Signup.tsx` | Replace form labels with `t()` |
| Additional dashboard pages | Incremental translation |

### Summary
Install `react-i18next`, create translation JSON files (AI-generated for the 9 non-English languages), and progressively replace hardcoded strings with `t()` calls starting from the most visible pages.

