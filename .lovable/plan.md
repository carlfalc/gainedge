# GAINEDGE_UI_FEATURE_AUDIT_V1

Read-only product/UI audit at HEAD `2d6896e` (RON core frozen at Orchestration V7). No code was changed, nothing deployed, no DB writes.

## 1. Surface inventory (what each page is trying to do)

| Route | File | Intent | Reality |
|---|---|---|---|
| `/dashboard` | `src/pages/dashboard/DashboardHome.tsx` (376 ln) | Command centre: stats, news, movers, volume, instrument tiles | Carries its own duplicate copy of the instrument-card logic alongside `InstrumentTrackingPanel` |
| `/dashboard/charts` | `TradingViewChartPage.tsx` + `TradeExecutionPanel.tsx` (1021 ln) | Native chart, drawings, indicators, order panel | Largest and densest surface in the app |
| `/dashboard/signals` | `SignalsPage.tsx` (68 ln) | Falconer live trade list | Raw table of prices/status, no plain-English layer, no empty/loading/error states |
| `/dashboard/strategy` | `StrategyPage.tsx` (400 ln) | Falconer engine config + readiness + recent trades | Exposes raw engine internals (`min_atr_pct`, `pullback_tol`, pineconnector JSON) to all users |
| `/dashboard/ron-decision` | `RonDecisionPage.tsx` (184 ln) | Stored seven-agent audit record | Truthful but engineer-facing: hashes, `trace_id`, raw observation keys, ISO UTC anchors |
| `/dashboard/ai` | `GainEdgeAIPage.tsx` | Ask RON conversational surface | Separate from the RON decision record — no cross-link either way |
| `/dashboard/insights`, `/analytics`, `/backtesting`, `/journal`, `/calendar`, `/my-news` | respective pages | Retrospective / educational content | Mixed quality; `insights` and `analytics` overlap conceptually |
| `/dashboard/settings`, `/clock-settings`, `/news-settings` | 3 pages | Preferences | Three separate top-level nav items for one concept |
| `/dashboard/whisky-cigar-lounge` | lounge page | Community | Fine as-is |
| Popouts | `ChartPopout`, `InstrumentsPopout`, `LoungePopout` | Distraction-free windows | Reasonable |

## 2. Top UX problems (ranked)

**HIGH**
1. Duplicated instrument-card implementation. `DashboardHome.tsx` and `components/dashboard/InstrumentTrackingPanel.tsx` both define `ScanResult`, `adxLabel`, `rsiLabel`, `stochLabel`, hidden-pane / card-order localStorage and drag reordering. Two sources of truth for the same tile; only the panel has the newer RON snapshot, quote-freshness and pattern-interpretation wiring.
2. RON V7 is effectively invisible. Nothing in the UI states that a decision came from a seven-agent orchestration run, which version, or which specialists contributed. `RonDecisionPage` is the sole surface and it is a single hardcoded `XAUUSD / 15m` lookup.
3. Technical clutter as the default view. Decision hash, trace id, `feature_version` style observation keys and raw agent ids are shown before any plain-English summary.
4. Time is presented as raw ISO UTC on the decision surface (`view.decision.as_of`) while `src/lib/signal-time.ts` already has a local-time formatter used elsewhere. Users cannot tell how old the record is.
5. No mobile strategy. `useIsMobile` is only referenced by the unused shadcn `sidebar.tsx`. `DashboardLayout` sidebar, tables and the 1000-line trade panel are desktop-only in practice.

**MEDIUM**
6. Live quote vs completed 15m close is only distinguished inside `InstrumentTrackingPanel` (via `isQuoteFresh` / `QUOTE_FRESH_MS`). Elsewhere prices are shown with no provenance label.
7. `SignalsPage` has no loading, empty-with-guidance, or error state and silently returns on missing session.
8. Navigation is a flat 16-item list in `DashboardLayout.tsx` with no grouping; "RON Decision" and "GainEdge AI" sit as untranslated raw-string labels among i18n keys.
9. Inline `style={{...}}` with the `C` palette from `src/lib/mock-data.ts` across ~30 files instead of semantic tokens — a module named "mock-data" is the de-facto design system.
10. Readiness on `StrategyPage` is a raw candle row count, not a user-legible readiness state.

**LOW**
11. `Insights` vs `Analytics` vs `Backtesting` overlap without a clear story.
12. Three settings entries in the top-level nav.
13. `mock-candles.ts` / `mock-data.ts` naming implies fake data in a product that governs itself on data integrity.

## 3. Where RON V7 is invisible / confusing / duplicated

- Invisible: orchestration run version, the seven specialists as a named panel, Session→Pattern dependency, evidence freshness at decision time vs now, replay determinism.
- Confusing: `state` values shown as raw enums (`OPPORTUNITY_INCOMPLETE`, `CONTEXT_SUPPORTED`) with no gloss; `Probability: not calibrated` is correct but reads like a defect rather than a deliberate governance stance.
- Too technical: hashes and trace ids at top level; observations rendered as `key: value` monospace pairs.
- Duplicated: pattern/session/structure narrative exists both in `lib/pattern-interpretation.ts` (client-side heuristics on the tile) and in stored RON evidence — two different explanations of the same market.
- Missing: any per-instrument statement that calibration exists for XAUUSD 15m only.

## 4. Truthful expansion opportunities (no probability, no geometry, no execution, no profit claims)

- Plain-English state glossary and "what this does / does not mean" copy.
- "What strengthens / what invalidates" rendered from the already-stored `explanation.why` and `explanation.what_would_change` — no new inference.
- Evidence freshness shown twice, explicitly labelled: freshness *at decision time* (stored) and *age now* (derived clock delta), in the user's local zone.
- Progressive-disclosure evidence drill-down: agent summary line by default, raw observations behind a "Technical detail" toggle.
- Replay/version history as "this record is reproducible — same inputs, same result", with version chips instead of hashes (hash available on copy).
- Per-instrument readiness badge: `Calibrated` only for the accepted XAUUSD 15m artifact; everything else `Not calibrated — context only`. Never inherit XAU calibration.

## 5. Assessment of the proposed ideas

| Idea | Verdict | Placement |
|---|---|---|
| Live quote vs completed 15m close | JUSTIFIED — helper exists (`isQuoteFresh`), applied in one place only | Shared `PriceProvenanceBadge` used by the instrument tile, chart header and decision card |
| Plain-English RON decision card | JUSTIFIED — highest value | Top of `RonDecisionPage`, and a compact variant on `DashboardHome` |
| What strengthens / what invalidates | JUSTIFIED — data already stored | Decision card body |
| Evidence freshness / age in local time | JUSTIFIED | Decision card + evidence rows |
| Specialist drill-down, clutter hidden by default | JUSTIFIED | Collapsible per-agent rows replacing the current always-open block |
| Replay/version history | JUSTIFIED but scope-limited | "Record integrity" footer strip: run version, spec versions, copyable hashes |
| Per-instrument calibration/readiness | JUSTIFIED and safety-relevant | Badge on tiles, decision card and `StrategyPage` readiness column |
| Chart/navigation improvements | PARTIAL — group nav now; defer chart refactor | `DashboardLayout` nav grouping only |
| Notification UX | DEFER — current alert toggles imply capabilities not governed yet | Not in the next three slices |

## 6. Remove or simplify

- Delete the duplicated tile logic in `DashboardHome.tsx`; render `InstrumentTrackingPanel` only.
- Remove hash/trace strings from the primary decision view; keep them in a copyable integrity footer.
- Collapse the three settings nav entries into one Settings page with tabs.
- Hide advanced Falconer engine numerics (`min_atr_pct`, `max_atr_pct`, `pullback_tol`, pineconnector JSON) behind an Advanced disclosure.
- Rename the `C` palette import away from `mock-data` (mechanical, cosmetic, low priority).

## 7. Recommended 3 slices (priority order)

**Slice 1 — Plain-English RON Decision Card (`GAINEDGE_UI_RON_DECISION_CARD_V1`)**
Read-only consumer of the existing `ron-decision-read` output. Adds: state gloss, strengthens/invalidates panels from stored explanation fields, freshness-at-decision vs age-now in local time, `Probability: not calibrated — by design` framing, integrity footer with copyable hashes, evidence drill-down collapsed by default. Touches `RonDecisionPage.tsx` plus new presentational components. No edge function, no schema, no RON core.

**Slice 2 — Price provenance + per-instrument readiness badges (`GAINEDGE_UI_PROVENANCE_READINESS_V1`)**
Two shared badges: live-quote-vs-completed-bar (from `isQuoteFresh`/`QUOTE_FRESH_MS`) and per-instrument calibration status that hard-codes no transfer of XAUUSD calibration. Applied to the instrument tile, chart header and decision card. Presentation only.

**Slice 3 — Dashboard de-duplication + navigation grouping (`GAINEDGE_UI_DEDUPE_NAV_V1`)**
Remove the duplicate tile implementation from `DashboardHome.tsx` in favour of `InstrumentTrackingPanel`; group the 16 nav items into Trade / Intelligence / Review / Settings; fold the three settings routes into tabs; add loading/empty/error states to `SignalsPage`.

Each slice is independently shippable, testable, and consumes frozen RON outputs without modifying them.
