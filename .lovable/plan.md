# Phase 2D.1d — Recovered-Source Downstream Impact Inventory (READ-ONLY)

Recommended next checkpoint: **A (impact/inventory audit)**, not B (rebuild) and not C (Research V3).

## 1. Scope

A strictly read-only audit that quantifies exactly which downstream RON artifacts were derived while the 76,238 recovered XAUUSD 1m candles were still absent, and produces a frozen, hash-stamped impact manifest that a later versioned rebuild (Phase 2D.1e) must reproduce or supersede. No migrations, no function deploys, no cron changes, no rows written, no version bumps.

Deliverables (evidence only, reported in chat plus a checked-in read-only audit script if the repo already has one; otherwise chat-only):
- Per-artifact staleness inventory: quality v3 flags, feature v4 snapshots, label v5 outcomes, calibration v4/v5/v6, research V1/V2.
- Exact affected-row counts and bar_time ranges for each artifact intersecting `(2026-05-15T00:01Z, 2026-07-31T17:32Z)`.
- Classification of each artifact as `unaffected`, `affected_conservative` (was excluded, may now become eligible), or `affected_contradictory` (a stored value would change sign/eligibility).
- A recomputed-but-not-persisted spot check on a bounded sample (<= 50 bars) proving the direction of change.
- A written rebuild dependency order for Phase 2D.1e (qv -> fv -> lv -> calibration), with the version numbers to be used.

## 2. Why this is the next dependency

The recovery inserted genuine 1m history *after* the v3/v4/v5 lineage was already built:

- rebuild jobs completed 2026-08-12 03:15 / 03:25 / 03:37Z; the recovery job completed 2026-08-12 08:34:56Z.
- 4,465 feature v4 snapshots exist inside the recovered window (15m candles there: 4,466).
- All 4,465 label v5 outcomes inside that window carry `coverage_ok = false`; the label v5 coverage histogram is dominated by `genuine_data_gap: 4439`.

So the current labels encode "no 1m data" for a window where genuine 1m data now exists. Rebuilding (B) before measuring produces a new lineage with no auditable statement of what changed and why, and Research V3 (C) would be run on labels whose eligibility base is about to move — both violate the reproducibility discipline enforced since Phase 2B.1. Measure first, then rebuild, then research.

## 3. Read-only evidence required before any write

- Immutability canaries: XAUUSD 1m count at cutoff 2026-08-12T07:54:00Z = 174,425; strict recovered range count = 76,238 with min 2026-05-15T00:01Z / max 2026-07-31T17:32Z; recovery job `8d2ca692-576c-4fca-86ab-7f564e69b1dc` status `complete`, inserted 76,238, digest `bfc7fa18…16ad8`.
- Frozen-artifact canaries: research V1 and V2 ids/hashes/row counts (V2 = `8b32c54c…`, hash `3dc82dde…`); calibration v4 id/hash/126 cells; calibration v6 `9c4ca06e…` hash `082db6fa…`.
- Timeline proof: `ron_rebuild_jobs.completed_at` per stage vs `ron_data_recovery_jobs.completed_at`.
- Affected-set queries: v4 snapshots and v5 outcomes intersecting the recovered window; coverage_class and data_resolution histograms inside vs outside the window; quality v3 flags inside the window by rule_code.
- Eligibility delta estimate: for the in-window bars, count how many are currently excluded solely by `genuine_data_gap` / `coverage_ok = false` and would now have a complete 1m forward window under the existing labeller contract.
- Re-verify privilege lockdown from 2D.1c-a still holds (service_role only on `bulk_insert_candles`, `ron_data_recovery_jobs`, `ron_verify_cron_token`).
- Confirm `allow_live_execution = false` and `execution_path = {signal_only}`.

## 4. Do not touch

- No INSERT/UPDATE/DELETE on `candle_history`, and no touching the recovery job row or digest.
- No new migrations, no privilege changes, no cron edits, no edge-function deploys.
- No version bumps: quality stays 3, feature 4, label 5, calibration 6, research 2 during this checkpoint.
- `_shared/falconer-strategy.ts` semantics untouched; no execution enablement; no numeric probability added to the dashboard.
- No Research V3 work, and no implementation of the venue-aware expected-open continuity contract (recorded as a Phase 2D.2 prerequisite only).
- Do not re-run `ron-rebuild`, `ron-calibrate`, or `ron-research`.

## 5. Terminal acceptance criteria

- Every canary in section 3 matches its pre-audit value byte-for-byte at the end of the audit.
- The impact manifest states, per artifact and version, affected row counts, ranges and classification, with the query used for each number.
- The audit explicitly answers: how many currently-ineligible in-window anchors are expected to become eligible after rebuild, and the expected direction of change in eligible LONG/SHORT counts.
- A Phase 2D.1e rebuild spec exists with concrete next version numbers and stage order, plus the exact canaries the rebuild must preserve.
- Zero writes of any kind are demonstrable (no new rows in any RON table, no new migration file, no function version change).

## 6. Stop boundary

Stop immediately after the impact manifest and the 2D.1e rebuild spec are reported. Do not begin the rebuild, do not bump versions, do not start Research V3.

## 7. Current-state drift since Phase 2D.1c-a acceptance

- **Material drift:** the entire qv3/fv4/lv5 lineage predates the recovery insert (03:15–03:37Z vs 08:34Z). 4,465 in-window feature v4 snapshots and their 4,465 label v5 outcomes are all `coverage_ok = false`, so downstream eligibility is currently understated for the recovered window.
- Calibration v6 (`9c4ca06e…`, `source_as_of 2026-08-12T06:09:00Z`) is also pre-recovery and is stamped `status = research`; it is therefore stale with respect to the recovered source, though its hash is unchanged.
- The live snapshot cron is still healthy — feature v4 snapshots extend to 2026-08-12T09:00Z.
- Version constants in code: quality 3, feature 4, label 5, research 2; `CALIBRATION_VERSION = 2` in `_shared/ron-calibration.ts` while persisted runs reach v6, so the runtime constant lags the persisted contract version — flag for confirmation during the audit before any rebuild picks a next version number.
- No drift found in the recovery canaries: 174,425 / 76,238 / digest `bfc7fa18…16ad8` all unchanged.
