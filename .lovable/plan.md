# Discovery-to-Signal, Server-Side Agents, Instrument Registry

Three sequenced workstreams. Findings below come from reading the code and querying the live database this turn.

## Corrections to the brief (read first)

1. **`StrategyPage.tsx` is NOT dead.** It is the Falconer live engine control panel (`falconer_settings`: enabled, `execution_path`, symbols, risk, `allow_live_execution`, daily loss caps, PineConnector). Deleting it removes the only UI for live execution safety limits. It stays.
2. **`BacktestingPage.tsx` is a shell, not a duplicate.** It embeds `StrategyLabPage` and `StrategyLabV2Page` behind a switch *and* owns the only UI for `falconer-backtest` / `falconer_backtest_runs` (equity curve, trade list). That Falconer backtest UI must be salvaged before anything is removed.
3. **Only `StrategyLabPage.tsx` (Lab V1, `strategy-lab-backtest`) is genuinely superseded** by V2. It has no unique logic beyond the V1 endpoint and its own tables.
4. **Promoted strategies must not be written into `falconer_trades`.** That table is the Falconer v7 Pine port's record, and `signal-notifications.ts` documents it as such ("Falconer strategy record"). Mixing lab strategies in corrupts Falconer provenance and its P&L/outcome logic. Instead, add a **third source** to the *existing* popup layer — same components, same dedupe machinery, no second signal system.
5. **Promoted strategies must not be injected into the RON seven-agent decision surface.** Those specs are hash-sealed and replay-audited (`ron-*-spec*.ts`, `ron-decision-read`). Promoted-strategy signals are a sibling producer of the same *delivery* layer, not a new RON agent.
6. **NZDUSD and USDCAD are already backtestable today** — `candle_history` holds 6,583 and 6,429 15m bars respectively (Mar 2026 → now). Nothing to ingest; only the Lab's hardcoded market list blocks them.

---

# 1. Close the loop: discovery to live signals

### What already exists and must be reused

| Piece | File | Role |
| --- | --- | --- |
| Popup delivery | `src/components/dashboard/GlobalSignalNotifications.tsx` | Mounted once in `DashboardLayout`; realtime subscriptions, per-user filtering, baseline suppression |
| Popup logic | `src/lib/signal-notifications.ts` | Dedupe keys, baseline seeding, visible stack — already has *two* sources (Falconer + `ron_material_events`) |
| Signals page | `src/pages/dashboard/SignalsPage.tsx` + `src/components/signals/*` | Tabbed surface (RON Opportunities / Falconer / History / Event Review) |
| Data access | `src/services/signals-data.ts` | Per-user reads + realtime reload pattern |
| Server runtime | `supabase/functions/ron-context-scheduler/index.ts` | 24/7 per-instrument loop, venue gating, one-anchor-per-bar idempotency |
| Outcome layer | `ron_event_outcomes`, `ron_event_lessons`, `supabase/functions/ron-outcome-evaluate`, `_shared/ron-outcomes-v3.ts` | MFE/MAE/follow-through over strict clock-time horizons with coverage classification |
| Lab output | `strategy_lab_v2_runs.final_result`, `strategy_lab_v2_candidates.genome` | Genome, exact rules, fold + holdout metrics, bootstrap probabilities |

**What `ron-outcome-learning` gives us:** the horizon-evaluation *engine* (`ron-outcomes-v3.ts`) is reusable verbatim for MFE/MAE and data-coverage honesty. What it does **not** give us: SL/TP-aware trade outcomes, per-strategy expectancy tracking, or any demotion concept. Those are new. Reuse the pure functions; do not reuse `ron_event_outcomes` rows (they are keyed to `ron_material_events`).

### New database objects (one migration)

```
promoted_strategies
  id uuid pk, user_id uuid not null, source_run_id uuid -> strategy_lab_v2_runs(id),
  source_candidate_id uuid -> strategy_lab_v2_candidates(id),
  symbol text, timeframe text, genome jsonb, exact_rules jsonb,
  grammar_version text, engine_version int, candidate_hash text,
  holdout_metrics jsonb, win_rate_lower_95 numeric, p_profit_factor_gt_1 numeric,
  expectancy_r_backtest numeric,
  status text ('active'|'paused'|'demoted'|'archived') default 'active',
  signal_enabled boolean default true,
  execution_enabled boolean default false,        -- NEVER set by promotion
  execution_enabled_at timestamptz, execution_enabled_by uuid,
  demotion_reason text, demoted_at timestamptz,
  created_at/updated_at
  unique (user_id, source_candidate_id)

promoted_strategy_signals            -- the live signal record (popup source #3)
  id uuid pk, user_id uuid not null, strategy_id uuid -> promoted_strategies(id),
  symbol text, timeframe text, direction text, bar_open timestamptz,
  evaluation_anchor timestamptz, entry_price/sl_price/tp_price numeric,
  rule_snapshot jsonb, status text ('open'|'target'|'stop'|'expired'),
  provenance jsonb,   -- {source_run_id, candidate_hash, holdout_metrics, win_rate_lower_95, p_pf_gt_1}
  execution_allowed boolean default false,
  created_at/updated_at
  unique (strategy_id, bar_open)      -- idempotency per closed bar

promoted_strategy_outcomes
  id uuid pk, strategy_id uuid, signal_id uuid unique,
  realised_r numeric, mfe/mae numeric, bars_observed int,
  coverage_class text, outcome_version int, resolved_at timestamptz, created_at

promoted_strategy_performance         -- rolling live-vs-backtest ledger
  strategy_id uuid pk, signals int, resolved int, wins int,
  live_win_rate numeric, live_expectancy_r numeric,
  backtest_expectancy_r numeric, degradation_ratio numeric,
  last_evaluated_at timestamptz, updated_at
```

Grants: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;` on every table, no `anon`. RLS scoped to `auth.uid() = user_id` (child tables via `EXISTS` on the parent). `updated_at` triggers via the existing `update_updated_at_column()`.

### Files

New:
- `supabase/functions/_shared/promoted-strategy-contracts.ts` — promotion record shape, `PROMOTION_EXECUTION_ALLOWED = false`, demotion thresholds, validity checks.
- `supabase/functions/_shared/promoted-strategy-evaluator.ts` — pure: given a genome + closed bars, does the rule fire on the last closed bar? Must reuse the **same** signal primitives as `strategy-lab-v2-engine.ts` so live evaluation is bit-identical to backtest.
- `supabase/functions/promote-strategy/index.ts` — auth'd; validates the run verdict is `VIABLE_STRATEGY_FOUND`, copies genome + holdout metrics, writes `promoted_strategies` with `execution_enabled = false`.
- `supabase/functions/promoted-strategy-monitor/index.ts` — service-role; per active strategy, on each newly completed bar, evaluates and inserts a signal (idempotent on `bar_open`).
- `supabase/functions/promoted-strategy-outcomes/index.ts` — resolves open signals against `candle_history` using `ron-outcomes-v3.ts` horizon logic; updates the performance ledger; demotes to `status='demoted'`, `signal_enabled=false` when `degradation_ratio` breaches the threshold over a minimum resolved-signal count.
- `src/services/promoted-strategies.ts` — read/enable/disable hooks.
- `src/components/signals/PromotedStrategiesTab.tsx` + `src/components/signals/PromotedStrategyCard.tsx` — list, provenance panel (run id, holdout numbers, `win_rate_lower_95`, P(PF>1)), signal toggle, and a separate, confirm-gated execution toggle.

Changed:
- `src/lib/signal-notifications.ts` — add a third source block mirroring the RON block (`derivePromotedNotification`, baseline, dedupe, `viewPromotedHref`). No new UI primitive.
- `src/components/dashboard/GlobalSignalNotifications.tsx` — third realtime channel on `promoted_strategy_signals` filtered `user_id=eq.<uid>`.
- `src/pages/dashboard/SignalsPage.tsx` — add the "Promoted Strategies" tab.
- `src/pages/dashboard/StrategyLabV2Page.tsx` — "Promote to live monitoring (signal-only)" button, shown only on `VIABLE_STRATEGY_FOUND`, with explicit copy that it does not enable broker orders.
- Cron: one new `pg_cron` job → `promoted_strategy_monitor_cron_tick()` (5-minute cadence, Vault-token pattern copied from `ron_snapshot_cron_tick`), plus a 10-minute outcomes tick.

### Safety posture

`execution_enabled` defaults false, is never written by `promote-strategy`, and the monitor function stamps `execution_allowed: false` on every signal row. Actual broker order placement stays where it is today (`metaapi-trade` + `falconer_settings.allow_live_execution`) and is not wired to this table in this workstream.

### Risks

- Backtest/live divergence if the evaluator drifts from `strategy-lab-v2-engine.ts`. Mitigation: shared primitives + a replay test that runs the evaluator over a holdout slice and reproduces the stored fold trades.
- Popup noise: many promoted strategies × 6 instruments. Cap per-user active promotions and rate-limit popups per strategy per bar.
- Demotion thresholds are a judgement call; make them constants in the contracts file with a minimum sample size so a 3-trade losing streak cannot demote.

---

# 2. Server-side 24/7 discovery agents

### Current behaviour
`StrategyLabV2Page.tsx:174 executeRemaining()` loops `run_agent` → `finalise` from the browser (max 40 tries). `strategy-lab-v2-discover` already implements the bounded-generation checkpoint model (≤64 genomes/invocation, checkpoint in `strategy_lab_v2_agent_runs.artifact`). The search does not change.

### Options in this stack
| Option | Verdict |
| --- | --- |
| Scheduled edge function alone | No; edge functions have no native scheduler here — pg_cron is the trigger mechanism already used by 11 jobs |
| Long-running worker process | Not available; no persistent server |
| **pg_cron tick → driver edge function → one generation per invocation, state in Postgres** | **Fits.** Matches the existing `ron-context-scheduler` pattern and respects the CPU ceiling that forced #31 |

### Design
A `strategy_lab_v2_queue` lease table plus a `strategy-lab-v2-drive` function:

```
strategy_lab_v2_queue
  run_id uuid pk -> strategy_lab_v2_runs(id), user_id uuid,
  state text ('queued'|'running'|'paused'|'done'|'failed'),
  lease_owner text, lease_expires_at timestamptz,
  attempts int default 0, consecutive_failures int default 0,
  paused_reason text, last_error text,
  next_run_at timestamptz, created_at/updated_at
```

Per the background-job rules: bounded work per tick (**one generation**), a single-flight lease (`lease_expires_at`, claimed with `UPDATE ... WHERE lease_expires_at < now()`), idempotent progress (checkpoint already persisted per generation), a circuit breaker on repeated failures, and a paused-state guard read at the top of every tick.

New files:
- `supabase/functions/strategy-lab-v2-drive/index.ts` — service-role; claims one lease, calls the same internal step `strategy-lab-v2-discover` uses (extract the step into `_shared` rather than HTTP self-invocation), releases the lease, sets `next_run_at`.
- Migration: queue table + grants + RLS + `strategy_lab_v2_drive_cron_tick()` and the pg_cron entry (1-minute cadence).

Changed:
- `supabase/functions/strategy-lab-v2-discover/index.ts` — `start` enqueues instead of returning `next_agents` for the client to drive; keep `run_agent` for manual/debug use.
- `src/pages/dashboard/StrategyLabV2Page.tsx` — delete `executeRemaining`; poll `action:"status"` (or subscribe to `strategy_lab_v2_runs` realtime) and render server progress. "Resume run" becomes "Requeue".

### Risks
- Two drivers (old browser tab + cron) racing a run. The lease prevents corruption, but ship the client change in the same release.
- A crashed invocation leaves a stale lease; expiry-based claiming handles it, and `attempts` bounds retries.
- Cron already runs 11 jobs at 1–5 minute cadence; a 1-minute driver adds load. Start at 1 minute with a hard one-run-per-tick cap.

---

# 3. Canonical instrument registry and page removal

### Today's three lists
- Lab V2: `supabase/functions/_shared/strategy-lab-v2-contracts.ts:5` → `XAUUSD, NAS100, HK50, GER40`
- Live RON: `supabase/functions/_shared/ron-agentic-watch-universe-v1.ts` → `XAUUSD, NAS100, NZDUSD, USDCAD, HK50, GER40` (plus `USOUSD`, `UKOUSD` as data-only)
- Landing mock: `src/pages/Index.tsx:128` → `NAS100, US30, AUDUSD, NZDUSD, XAUUSD` (marketing mock data, not a product claim)
- Plus `instrument_library` (13 cols, broker symbol columns) and `broker_symbol_mappings` (100 rows, 5 brokers) already in the database.

### Plan
- New `src/lib/instrument-registry.ts` and mirrored `supabase/functions/_shared/instrument-registry.ts` (single source; the Deno copy re-declares the same frozen array — no cross-boundary import is possible). Canonical set = the six RON watch instruments, each with: canonical symbol, display name, asset class, venue class, `ron_watch: boolean`, `backtestable: boolean`, `timeframes`.
- `strategy-lab-v2-contracts.ts` derives `STRATEGY_LAB_V2_MARKETS` from the registry filtered on `backtestable` — this is what makes NZDUSD and USDCAD selectable. Data already exists, so no ingestion work.
- Keep `ron-agentic-watch-universe-v1.ts` as the frozen RON artifact; add an assertion test that registry ∩ watch matches, rather than editing the sealed file.
- `broker_symbol_mappings` stays the execution-symbol source of truth; add a test asserting every registry instrument has a mapping row for each supported broker, and a migration only if rows are missing.
- Landing mock: swap `Index.tsx` sample tiles to registry instruments so marketing matches the product.

### Page removal
- **Delete** `src/pages/dashboard/StrategyLabPage.tsx` (Lab V1 UI) and its `strategy-lab-backtest` invocation path. Salvage nothing beyond confirming no other importer.
- **Keep** `src/pages/dashboard/StrategyPage.tsx` (Falconer live control) — route `/dashboard/strategy`, nav entry `nav.strategy`.
- **Rework** `src/pages/dashboard/BacktestingPage.tsx`: drop the V1 switch, keep the Falconer `falconer_backtest_runs` history/equity UI, and render `StrategyLabV2Page` directly. Alternatively split the Falconer backtest UI into `src/components/backtesting/FalconerBacktestPanel.tsx` and make `/dashboard/backtesting` the V2 Lab page.
- `src/App.tsx` routes and `src/lib/dashboard-nav.ts` updated accordingly. Lab V1 tables (`strategy_lab_runs`, `strategy_lab_candidates`, `strategy_lab_agent_runs`, `strategy_lab_promotions`) and `supabase/functions/strategy-lab-backtest` are **left in place** — dropping them destroys research history and is a separate decision.

### Risks
- `strategy_lab_promotions` (existing V1 table) is a name collision with the new promotion concept. Keep them distinct; the new work uses `promoted_strategies`.
- Widening Lab markets changes nothing about RON's sealed instrument scope — do not let the registry become a back door into `admissibleInstrumentScope`.

---

## Sequencing and verification

1. Workstream 3 first (registry + page cleanup) — smallest blast radius, unblocks NZDUSD/USDCAD in the Lab.
2. Workstream 2 (server-side drive) — makes long runs survivable before they are load-bearing.
3. Workstream 1 (promotion → live signals → outcome tracking) — depends on both.

Each workstream ships with vitest coverage in `src/test/` following the existing contract-test style, and every migration follows CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY.
