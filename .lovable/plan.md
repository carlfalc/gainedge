# RON Live-Anchor Compatibility V2 (close-anchor completion)

## Goal
Complete the forward-only fix so the 24x7 scheduler can produce persisted XAUUSD 15m
RON decisions at a **completed-bar-close** evaluation anchor, unblocking
`GAINEDGE_24X7_RON_FIRST_DECISION_CANARY_V1`.

## Root cause (audited, already confirmed)
- Session V2 & Pattern V2 use `as_of = bar OPEN`.
- Cross-Asset V2 endpoint **floors** `as_of` to the grid open, then the Cross V4 gate
  rejects `as_of_bar_completed_close > anchor`. So Cross can only pass when
  `anchor = bar OPEN`.
- Macro V2, Calibration V2, Falconer V1 are close/anchor-agnostic — no change needed.
- The single contradictory pair is **Session ↔ Cross**.

## Change surface (all forward-only; frozen V1/V2 specs/tests byte-identical)
| # | File | Change |
|---|------|--------|
| 1 | `_shared/ron-session-structure-spec-v3.ts` | **DONE.** Close-anchor restatement of V2. |
| 2 | `_shared/ron-pattern-structure-context-v3.ts` | New. Consumes **Session V3** sealed envelope; new acceptance fn (V2's requires `session.as_of === pattern.as_of`, false in close convention). |
| 3 | `_shared/ron-cross-asset-relationship-context-v3.ts` | New. `evaluation_anchor` = bar close; analytical open = anchor − 15m. |
| 4 | `_shared/ron-opportunity-risk-spec-v3.ts` | New. Lineage pins accept V3 Session/Pattern/Cross; V1/V2 replay preserved. |
| 5 | `_shared/ron-orchestration-run-v8.ts` | New. Pins Session V3, Pattern V3, Cross V3, Macro V2, Calibration V2, Opportunity V3, Falconer V1. |
| 6 | `_shared/ron-orchestration-run.ts` | Add V8 to version registry (import only). |
| 7 | `ron-agent-session-structure/index.ts` | Add `spec_version: 3` branch → V3 producer at close anchor. |
| 8 | `ron-agent-pattern-context/index.ts` | Add `spec_version: 3` branch. |
| 9 | `ron-agent-cross-asset-correlation/index.ts` | Add `spec_version: 3` branch; do **not** floor `as_of` to open. |
| 10 | `ron-orchestrate-run/index.ts` | Accept version 8 in selector. |
| 11 | `ron-schedule-orchestration` | Pin to orchestration version 8 + close anchor. |
| 12 | Tests | New tests for V3 specs, V8 plan hash, orchestrator V8 dry-run. |

## New spec hashes
Pattern V3, Cross V3, Opportunity V3, and Orchestration V8 plan hashes will be produced
deterministically from `hashCanonical` and pinned in the V8 spec object. Session V3 hash
is already generated from the completed file.

## Safety (unchanged from the accepted contract)
No execution, no numeric probability, no confidence, no trade geometry. V8 inherits every
V6/V7 seal gate plus the new close-anchor binding gates. Subject-bound reads still use the
caller JWT under RLS. `persist` remains explicitly-requested-only.

## Verification
- `tsgo --noEmit` and build pass.
- New unit tests green.
- Production non-persisting V8 dry-run at a close anchor passes all gates and returns a
  deterministic decision; then scheduler canary produces a persisted decision.
