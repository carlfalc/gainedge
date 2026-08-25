# GAINEDGE_MULTI_ASSET_AND_CHART_PERSISTENCE_AUDIT_V1

Read-only audit. No code was changed, nothing deployed.

## Files / services inspected

Backend runtime
- `supabase/functions/ingest-candles/index.ts` (DEFAULT_TARGETS, BROKER_SYMBOL alias map)
- `supabase/functions/metaapi-candles/index.ts`, `metaapi-backfill`, `ron-recover-15m`, `ron-recover-candles`
- `supabase/functions/ron-snapshot/index.ts`, `_shared/ron-features.ts`, `_shared/ron-window.ts`, `_shared/ron-quality-contract.ts`
- `supabase/functions/_shared/ron-data-quality.ts`, `_shared/ron-sessions.ts`, `_shared/ron-venue-calendar.ts`
- All seven specialists: `ron-agent-session-structure`, `ron-agent-pattern-context`, `ron-agent-calibration-validation`, `ron-agent-cross-asset-correlation`, `ron-agent-macro-news-geopolitics`, `ron-agent-opportunity-risk`, `ron-agent-falconer-signal-source` and their `_shared` specs (session v1/v2/v3, pattern v1/v2/v3, cross-asset v1/v2/v3, macro spec + temporal v2, calibration validation + diagnostic v2, opportunity-risk v1–v4, falconer signal source, HA pattern context v1)
- `_shared/ron-orchestration-run-v9.ts`, `ron-orchestrate-run`
- `_shared/ron-opportunity-context-spec-v1.ts`, `_shared/ron-opportunity-context-runtime-v1.ts`, `ron-opportunity-context`
- `supabase/functions/ron-schedule-orchestration/index.ts` + `anchor-gate.ts`

Frontend
- `src/pages/dashboard/TradingViewChartPage.tsx`, `src/components/dashboard/ChartTabPane.tsx`, `TradingViewWidget.tsx`, `AddChartTabModal.tsx`, `src/pages/ChartPopout.tsx`
- `src/services/signals-data.ts`, `ron-opportunity-context.ts`, `ron-decisions.ts`, `ron-snapshots.ts`
- `src/lib/signal-notifications.ts`, `src/components/dashboard/GlobalSignalNotifications.tsx`

Production data (read-only queries)
- `candle_history` per symbol/timeframe currency
- `ron_market_snapshots` per symbol/feature_version

## Verified production state

`candle_history` 15m latest bar (as of audit):
- XAUUSD 09:45Z today, NAS100 09:45Z today (both live)
- HK50, NZDUSD, USDCAD, USOUSD, UKOUSD, US30, SPX500, EURUSD, GBPUSD, USDJPY, XAGUSD, GER40, UK100, JPN225 — all frozen at 2026-05-28 11:15Z
- Correction to a pre-audit assumption: oil **does** exist as `USOUSD` (WTI, 3970 bars) and `UKOUSD` (Brent, 3978 bars), both stale. Provider aliases already exist in `metaapi-candles`: `USOUSD -> XTIUSD/USOUSD/XTIUSD.i/WTI`, `UKOUSD -> XBRUSD/UKOUSD/XBRUSD.i/BRENT`, `HK50 -> HK50/HK50.i`, `USDCAD -> USDCAD.i/USDCAD`.

`ron_market_snapshots`: feature_version 7 exists only for XAUUSD 15m (139 rows, latest 09:45Z). Versions 1–6 also XAUUSD only.

Root cause of staleness: `ingest-candles` `DEFAULT_TARGETS` is only `XAUUSD 15m`, `NAS100 15m`, `XAUUSD 1m`. Everything else was backfilled once in May and never re-ingested. Its `BROKER_SYMBOL` map contains one entry (`NAS100 -> NDX100`) and does not carry the richer alias table that `metaapi-candles` already has.

Scope locks found (every specialist declares `instrument_scope: ["XAUUSD"], timeframe_scope: ["15m"]` and fails closed on anything else):
- `ron-session-structure-spec.ts:28`, `-v2.ts:41` (v3 inherits v2)
- `ron-pattern-context-spec.ts:60` (v2/v3 inherit)
- `ron-cross-asset-spec.ts:67` plus `counterpart_scope` fixed to NAS100 (v2/v3 inherit)
- `ron-macro-news-geopolitics-spec.ts:112`, `ron-macro-temporal-context-v2.ts:83`
- `ron-calibration-validation-spec.ts:64` (diagnostic v2 inherits)
- `ron-opportunity-risk-spec.ts:75` with a hard type-level check at line 272 (`input.instrument as "XAUUSD"`); v2–v4 inherit
- `ron-falconer-signal-source-spec.ts:129`
- `ron-ha-pattern-context-spec-v1.ts:53` with enforcement at line 450
- `ron-opportunity-context-spec-v1.ts:66` with enforcement at line 472, and its runtime re-checks at `ron-opportunity-context-runtime-v1.ts:116`

Snapshot writer: `ron-snapshot/index.ts:20` `const SYMBOL = "XAUUSD"`, plus a hardcoded XAUUSD venue schedule (`marketOpen`, Sun 17:00 NY → Fri 17:00 NY with the 17:00 break). `computeRonSnapshot` in `_shared/ron-features.ts` is itself symbol-agnostic — it takes candles. The lock is the worker, not the maths.

Session logic: `_shared/ron-sessions.ts` and `ron-venue-calendar.ts` encode the XAUUSD/FX 24×5 venue with Asian/London/NY windows. This is correct for XAUUSD, NZDUSD, USDCAD and acceptable for NAS100 (index CFD tracks the same 24×5 CFD clock). It is **not** correct for HK50, which trades HKEX cash hours with a lunch break and Hong Kong holidays. Nothing in the codebase models exchange-hour instruments.

Scheduler: `ron-schedule-orchestration/index.ts` queries with `.eq(..., RUNTIME_INSTRUMENT)` at lines 70/73/76/79 and builds a single-instrument trace id at line 112; `anchor-gate.ts` exports `RUNTIME_INSTRUMENT = "XAUUSD"`, `RUNTIME_TIMEFRAME = "15m"` and selects at most one anchor per tick. It is single-instrument by construction but the gate function itself is pure and parameterisable — the constants are the only obstacle, plus the one-anchor-per-tick shape.

Frontend: `signals-data.ts` already honours the user's tracked instrument list with no caps or fallback pair. `ron-decisions.ts` / `ron-opportunity-context.ts` / `GlobalSignalNotifications.tsx` filter by symbol against tracked instruments and subscribe to table-level realtime, so they generalise to N instruments with no change. Chart mappings: `TradingViewWidget.tsx` `TV_SYMBOL_MAP` has NAS100, NZDUSD, USDCAD — but **no HK50 and no oil**. Fallback for an unknown symbol is `FX:<symbol>`, which would render a broken/incorrect chart for HK50 (correct would be `HSI` / `TVC:HSI` or a broker-prefixed `HK50`) and for oil (`TVC:USOIL`, `TVC:UKOIL`). `AddChartTabModal.tsx` catalogue also lacks HK50/oil.

## Five-instrument readiness matrix

| Stage | XAUUSD | NAS100 | HK50 | NZDUSD | USDCAD |
|---|---|---|---|---|---|
| Live 15m ingestion | READY | READY | NEEDS WORK — not in `DEFAULT_TARGETS`, stale since 2026-05-28; alias `HK50.i` exists in metaapi-candles only | NEEDS WORK — same, alias trivial | NEEDS WORK — same, alias `USDCAD.i` exists |
| v7 snapshots | READY | NEEDS WORK — writer hardcodes `SYMBOL="XAUUSD"` | NEEDS WORK — writer lock **plus** wrong venue calendar (HKEX hours/lunch/holidays unmodelled) | NEEDS WORK — writer lock only | NEEDS WORK — writer lock only |
| 7-agent orchestration | READY | BLOCKED — all 7 frozen specs scope-locked to XAUUSD; cross-asset additionally pins NAS100 as the counterpart, so NAS100-as-primary needs a new counterpart definition | BLOCKED — same, plus session-structure semantics assume a continuous venue | BLOCKED — spec scope only | BLOCKED — spec scope only |
| Opportunity Context | READY | BLOCKED — spec V1 scope-locked and self-declares that widening requires a new spec version | BLOCKED | BLOCKED | BLOCKED |
| Signals read surface | READY | READY | READY | READY | READY |
| Realtime popups | READY | READY | READY | READY | READY |
| Chart mapping | READY | READY | NEEDS WORK — absent from `TV_SYMBOL_MAP`; `FX:HK50` fallback is wrong | READY | READY |

Oil (`USOUSD`/`UKOUSD`): ingestion is straightforward (rows + aliases already exist), chart mapping needs two `TV_SYMBOL_MAP` entries; RON stages carry the same spec-scope block as the others. It is a cheap add once the generic path exists — no reason to hold it back beyond sequencing.

## Recommended rollout order

1. **Ingestion first, RON untouched.** Bring HK50 / NZDUSD / USDCAD (and optionally USOUSD/UKOUSD) 15m candles current and keep them current. This is low risk, changes no frozen artifact, and gives the data foundation everything else needs.
2. **Chart mappings + instrument catalogue.** HK50 and oil TradingView symbols. Pure frontend.
3. **Instrument-aware venue calendar.** Introduce an explicit venue registry (`fx_24x5` vs `exchange_hours`) covering HKEX; this is the prerequisite that makes HK50 honest rather than silently mis-sessioned. Until it exists, HK50 should stay ingestion+charts only.
4. **Snapshot writer generalisation** to a symbol/timeframe parameter, writing feature_version 7 rows for the additional instruments. Existing XAUUSD rows are untouched; the version does not need to bump because the feature semantics are unchanged — only the subject widens.
5. **Forward-only specialist V-next** for the four FX/index instruments (see below), proven first on NZDUSD + USDCAD (continuous venue, simplest), then NAS100, then HK50.
6. **Oil** as phase two, riding the now-generic path.
7. Broader indices/FX only after the pilot demonstrates the architecture is genuinely subject-generic.

## Exact forward-versioning required

Nothing below widens a frozen spec in place. Each is a new file/version whose only semantic delta is the subject set.

- Session Structure **V4** — `instrument_scope: [XAUUSD, NAS100, NZDUSD, USDCAD]` (+ HK50 only once venue-awareness lands), venue class as an explicit spec input rather than an implicit XAUUSD assumption.
- Pattern Context **V4** — inherits Session V4 provenance binding.
- HA Pattern Context **V2** — widened scope; pattern maths already symbol-agnostic.
- Cross-Asset **V4** — replaces the fixed XAUUSD→NAS100 pair with a declared `pair_registry` (e.g. NAS100→XAUUSD, NZDUSD→AUDUSD, USDCAD→USOUSD). Every pair must be explicitly registered; no inferred counterparts.
- Macro / News / Geopolitics **V3** (and temporal context V3) — per-instrument keyword taxonomy; `fetch-news` already has HK50 and USDCAD keyword sets to reuse.
- Calibration Validation **V3** — per-instrument calibration artifacts. Note: no calibration artifact exists for any non-XAUUSD instrument, so these instruments will legitimately report unavailable calibration until artifacts are built.
- Opportunity/Risk **V5** — widened scope and removal of the `as "XAUUSD"` type-level narrowing; keeps the fail-closed readiness gate.
- Falconer Signal Source **V2** — widened subject binding, user-scope contract unchanged.
- Orchestration Run **V10** — pins the above V-next specs; V1–V9 remain reachable and unmodified.
- Opportunity Context **V2** — widened `instrument_scope`, consuming Session V4 / Pattern V4 / Cross-Asset V4 / Macro V3 envelopes, per its own clause that widening scope requires a new spec version.

Expected outcome for new instruments in early runs: `OPPORTUNITY_INCOMPLETE` / `lifecycle: none` until calibration and history mature. That is correct fail-closed behaviour, and the Signals lane already suppresses `none`.

## Ingestion / snapshot / scheduler changes required

- `ingest-candles`: extend `DEFAULT_TARGETS` to the pilot set; import the fuller alias table (`HK50.i`, `USDCAD.i`, `XTIUSD`, `XBRUSD`) rather than the one-entry `BROKER_SYMBOL` map; keep per-target failure isolation so one bad symbol never blocks the rest. Backfill the 2026-05-28 → now gap with the existing bounded `metaapi-backfill` / `ron-recover-15m` paths.
- `ron-snapshot`: accept `{ symbol, timeframe }`, default XAUUSD for backward compatibility, and take the venue schedule from the venue registry instead of the inline XAUUSD `marketOpen`.
- Data quality: `ron-quality` and the flags table are already keyed by symbol; only the invocation list widens.
- Scheduler: keep one pure `selectAnchor` per instrument, loop over a declared instrument list, and preserve idempotency through the existing `(instrument, timeframe, as_of)` decision check. Decisions are global, not per-user, so no duplication risk. Guard against a slow tick by bounding to one anchor per instrument per tick and invoking `ron-orchestrate-run` sequentially or with small concurrency; 5 instruments × 15m is well within budget.

## Part B — chart persistence

**Root cause.** Two independent causes, both real:
1. `TradingViewChartPage` is a route component. Navigating to any other dashboard route unmounts it, which unmounts every `ChartTabPane` and destroys the `tv.js` widget iframe. On return, `TradingViewWidget`'s effect clears `containerRef.innerHTML` and constructs a brand-new widget with `studies: []`. Nothing about the previous native state is read back.
2. Even if the component stayed mounted, the **public** `tv.js` widget is a cross-origin iframe with no save/load surface. There is no `save()`/`load()`, no `charts_storage_url`, no `auto_save_delay`, no `widget.subscribe('onAutoSaveNeeded')` — those belong to the licensed Advanced Charts / Trading Platform library. So today there is no way to serialise indicators or drawings out of it. The `chart_drawings` and `user_indicator_preferences` tables exist in the database but are referenced by **no** frontend code (legacy from the removed lightweight-charts page).

**What can and cannot be persisted from the public widget**
- Can: symbol, interval, theme, style, and a *preset* `studies` array supplied at construction (default indicator set, not user edits).
- Cannot: user-added indicators and their settings, drawings/markups, templates, pane layout, or any per-user chart state. All of it lives inside TradingView's origin and is unreadable.

**Tier A — immediate V1 workaround (viable, contained).** Keep the Charts route mounted across dashboard navigation by hoisting it into the shared dashboard shell and hiding it with CSS when another route is active (the same `display:none` technique `ChartTabPane` already uses for inactive tabs). This preserves indicators and drawings for the whole session while the user moves between dashboard pages. It does **not** survive a page reload, a new tab, or another device, and the UI must say so plainly rather than implying durable persistence.

Safety assessment of keeping it mounted:
- Memory: each TradingView widget is a full iframe, roughly 40–80 MB resident. Three or four tabs is acceptable on desktop; beyond that it degrades, so cap concurrent live tabs (e.g. 4) and lazily destroy the least-recently-used beyond that.
- Network/CPU: TradingView's own datafeed keeps streaming in a hidden iframe. That is TradingView's socket, not ours, but it is real background traffic.
- **Hidden MetaAPI activity is a genuine risk and must be handled.** `ChartTabPane` runs a 2-second `fetchCurrentPrice` poll (lines 72–87) and `TradeExecutionPanel` polls positions. Left mounted, those keep hitting MetaAPI from non-chart routes. Any Tier A implementation must gate the polling effect on a "charts route is visible" flag so polling pauses when the user is elsewhere. Without that gate, Tier A is not safe.
- Mobile: iframes should be torn down entirely on small viewports.

**Tier B — durable per-user persistence.** Requires the licensed TradingView Advanced Charts / Trading Platform library, self-hosted, with `save_load_adapter` (or `charts_storage_url`) wired to a per-user backend table plus a datafeed implementation. That is a licensing decision and a substantial build (custom datafeed against our candle store, layout/drawing storage schema, migration). The alternative without a licence is returning to a self-rendered chart (lightweight-charts) where we own and can persist every indicator and drawing — the `chart_drawings` / `user_indicator_preferences` tables were built for exactly that — at the cost of losing TradingView's toolset.

**Recommendation.** Do Tier A now, correctly gated, and label it as session-scoped. Treat Tier B as a separate product decision: licensed Advanced Charts if TradingView's toolset is a requirement, otherwise a self-rendered chart with true persistence.

## Contained implementation sequence (no code written yet)

1. `GAINEDGE_MULTI_ASSET_INGESTION_V1` — widen `ingest-candles` targets + aliases, backfill the gap for HK50/NZDUSD/USDCAD (+ USOUSD/UKOUSD). No RON change.
2. `GAINEDGE_CHARTS_SYMBOL_COVERAGE_V1` — HK50 and oil entries in `TV_SYMBOL_MAP`, `ChartPopout`, `AddChartTabModal`.
3. `GAINEDGE_CHARTS_SESSION_PERSISTENCE_V1` — Tier A hoist + visibility-gated polling + LRU tab cap + honest session-scoped labelling.
4. `GAINEDGE_RON_VENUE_REGISTRY_V1` — explicit instrument→venue-class calendar including HKEX.
5. `GAINEDGE_RON_SNAPSHOT_MULTI_INSTRUMENT_V1` — parameterised v7 snapshot writer + quality flags for the pilot set.
6. `GAINEDGE_RON_SPECIALIST_SCOPE_VNEXT_V1` — the forward-only specialist versions above, proven on NZDUSD/USDCAD first.
7. `GAINEDGE_RON_ORCHESTRATION_V10` + `GAINEDGE_RON_OPPORTUNITY_CONTEXT_V2` — multi-instrument orchestration and context.
8. `GAINEDGE_RON_MULTI_INSTRUMENT_SCHEDULER_V1` — per-instrument anchor loop with existing idempotency.
9. `GAINEDGE_RON_OIL_PHASE_2` — oil onto the proven generic path.

Steps 1–3 are independent of all RON freezes and can ship immediately. Steps 4–8 are strictly ordered.

`GAINEDGE_MULTI_ASSET_AND_CHART_PERSISTENCE_AUDIT_V1_READY`
