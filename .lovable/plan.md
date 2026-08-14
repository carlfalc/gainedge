# Read-only roadmap identification audit (post Falconer K1)

Result: **ROADMAP_AMBIGUOUS**. No file, test, migration, or spec in the repository names a phase after the `2D.2k*` Falconer subject-binding corrections. Nothing was modified during this audit.

## What the evidence actually establishes

- Phase labels exist only as comment markers in code/tests/migrations: `2D.1*` (lineage, venue calendar, recovery, research/calibration), `2D.2a` (agentic core persistence, `supabase/migrations/20260813074705_*.sql`), `2D.2b`–`2D.2j` (specialists), `2D.2k*` (Falconer subject binding). The newest marker in the repo is `2D.2k-b` at `src/test/ron-falconer-signal-source-v1.test.ts:641`.
- Specialist coverage is complete: all seven registered agents in `supabase/functions/_shared/ron-agent-contracts.ts:71-134` (`session_market_structure`, `pattern_context`, `cross_asset_correlation`, `macro_news_geopolitics`, `opportunity_risk`, `calibration_model_validation`, `falconer_signal_source`) have a shared spec module and an endpoint under `supabase/functions/ron-agent-*/`.
- Orchestration exists up to seven agents (`src/test/ron-orchestrator-seven-agent-v1.test.ts`) and the decision state today is `OPPORTUNITY_INCOMPLETE`.
- No roadmap document exists. `.lovable/plan.md` previously held the older Phase 0–5 RON plan, which predates the 2D.2 agentic work and does not name the next phase.

## Source-supported candidate next phases

### Candidate A — persisted live orchestration run (audit-scoped)
Evidence: `supabase/functions/ron-orchestrate/index.ts:45,66,115` has a `persist` branch that is never exercised; `ron-agent-pattern-context`, `ron-agent-cross-asset-correlation`, `ron-agent-opportunity-risk` and `ron-agent-falconer-signal-source` return `persisted: false` with no persist branch at all, while `ron-agent-session-structure:162-181` and `ron-agent-calibration-validation:186-205` do have audit-scoped persist. Production canaries have stayed at runs 6 / evidence 6 / decisions 2 / links 5 through every specialist phase. The asymmetry is the clearest open work item.

### Candidate B — unblock the opportunity/risk gate (Research V5 / promotion pipeline)
Evidence: `supabase/functions/_shared/ron-opportunity-risk-spec.ts:120-123,371-389` blocks construction with `blocked_not_calibrated` while `PROMOTED_STATE_VARIABLES` is empty (`supabase/functions/_shared/ron-agentic-architecture.ts`, Research V4 promoted zero variables). Until a research run promotes at least one variable, the orchestrator can never leave `OPPORTUNITY_INCOMPLETE`.

### Candidate C — read-only RON surface in the product
Evidence: `EXPECTED_AGENTS_V1` (`supabase/functions/_shared/ron-orchestrator.ts:30`) still lists only two agents, and no dashboard reader consumes orchestrator output; `src/pages/dashboard/DashboardHome.tsx` and `src/components/dashboard/InstrumentTrackingPanel.tsx` are untouched by the 2D.2 work. This is user-visible value but was explicitly out of scope in every 2D.2k instruction.

## Prerequisites already satisfied (all candidates)
Falconer K1 code + deployment + authenticated runtime smoke accepted (spec `40a4b6f9…1005f3`, strategy digest `13736f1e…81fc`); seven specialists built, hash-pinned and tested; agentic-core persistence schema live since `2D.2a`; full suite green at 636 tests.

## Safety invariants that must not change
Frozen `_shared/falconer-strategy.ts` digest; registry authority ranks, TTL multipliers and `EXPECTED_AGENTS_V1`; deterministic sealed Evidence V1 and endpoint/evidence availability parity; `numeric_probability = null`, `execution_allowed = false`, `execution_path = signal_only`; no service-role cross-user reads of `falconer_trades`; accepted calibration v8 / research v4 artifacts; existing decision hashes and cron set.

## Can implementation proceed autonomously now?
No. The next phase label is not derivable from the repository, and the three candidates differ materially (write-path activation vs. research promotion vs. UI). One of them must be designated before implementation.
