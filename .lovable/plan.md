# RON as the Intelligence Brain — Phased Architecture Plan

Falconer v7 TP3 stays frozen and becomes one pluggable model adapter. RON becomes a continuously running market-state engine, outcome-labelling pipeline and empirical probability layer. Execution stays off (`execution_path = signal_only`, `allow_live_execution = false`) throughout every phase in this plan.

## Verified current state (checked against the live database and code)

- Candle history is genuine and usable: 1m 165,000 rows (XAUUSD only), 15m 88,545 rows across 17 symbols, 1h 13,174, 5m 11,650, native 1d 1,884 (2 symbols), resampled `1d_r1h` 580.
- `live_market_data` holds 27 rows, last updated **2026-04-16** — stale by ~4 months. Its 30s compute cron is retired and `triggerMarketDataCompute()` in `src/services/broker-data.ts` is a no-op returning immediately.
- `falconer_trades` holds 666 rows but only **1** has a non-empty `features` object. Historical rows cannot train anything; they are outcome history only.
- 19 distinct symbols tracked in `user_instruments`, 2 user profiles today.
- `DashboardHome.tsx` fabricates `confidence: 8` per trade and `generateSparkData()` synthesises sparklines.
- Edge functions today: falconer-engine, falconer-backtest, metaapi-candles, metaapi-backfill, metaapi-trade, connect-metaapi, gainedge-ai, fetch-candles, fetch-news, forex-ticker, email functions.
- `src/services/pattern-detection.ts` (390 lines, rich) is client-only; the engine uses `_shared/pattern-analysis.ts` (55 lines).

## 1. Architecture and data flow

```text
MetaAPI / Eightcap
   |  (metaapi-candles, metaapi-backfill)
   v
candle_history  ------------------------------+
   |                                          |
   | ron-snapshot (every closed bar)          | ron-label (deferred forward window)
   v                                          v
ron_market_snapshots  ---------------->  ron_snapshot_outcomes
   |          ^                                   |
   |          | model_signals (Falconer + future) |
   |     model adapters (falconer v7 = adapter #1)|
   v                                              v
ron-score  <----- ron_stat_cells (empirical calibrated buckets) <--- ron-aggregate
   |
   v
ron_symbol_state (current RON verdict per symbol/timeframe, freshness + data health)
   |
   v
Dashboard (read-only) + gainedge-ai (explains RON output, never invents numbers)
```

Key rule: RON never derives a number from an LLM. `gainedge-ai` is downgraded to a narrator over `ron_symbol_state` / `ron_stat_cells` evidence rows.

## 2. Database changes

New tables:

- `ron_market_snapshots` — one row per symbol/timeframe/closed bar. Identity (symbol, timeframe, bar_time), OHLCV + spread, a `features jsonb` (RSI+slope, ADX/DMI, MACD state/hist/slope, StochRSI, ATR, atr_pct, volatility percentile + regime, EMA9/21/50/200 distance+slope, HTF daily context, structure HH/HL/LH/LL + regime, HA state, relative volume, S/R distances, session/hour/weekday/minutes-from-open, PDH/PDL/PWH/PWL, Asian range, position in daily range, news proximity), `patterns jsonb`, `model_signals jsonb` (per-model trigger state and distance-to-trigger even when nothing fires), `feature_version`, `data_health`. Unique on (symbol, timeframe, bar_time, feature_version), indexed by bar_time.
- `ron_snapshot_outcomes` — forward labels per snapshot: MFE/MAE in R and price, `hit_05r`…`hit_5r`, `stop_first`, bars/minutes to each target, forward returns at configurable horizons, regime after, `label_version`, `resolved_at`.
- `ron_stat_cells` — empirical statistics per segment key (symbol, session, weekday, hour bucket, regime, volatility bucket, pattern, trigger/model, and combinations). Stores n, wins, win_rate, mean R, Wilson confidence interval, min-sample flag, `dataset_split`, `computed_at`.
- `ron_symbol_state` — current RON verdict per tracked symbol/timeframe: state (WAIT / WATCH / SETUP FORMING / HIGH CONFLUENCE / ENTRY QUALIFIED), evidence score, calibrated probability (nullable when sample size is insufficient), uncertainty band, top evidence items, `snapshot_id`, freshness, `data_health`. This replaces `live_market_data` as the dashboard read model.
- `ron_models` — model registry: key, version, adapter, status (champion/challenger/retired), config, metrics.
- `ron_global_contributions` (Phase 4) — de-identified feature/outcome records: no user_id, no account id, no balances; carries `contribution_id`, normalised symbol, broker/feed tag, feature_version, model_version, source_quality. Plus `ron_consent` per user (opt-in, timestamp, revocation).

Changed/retired:

- `live_market_data`: keep read-only for one release while the dashboard migrates, then drop.
- `falconer_trades`: unchanged (parity frozen). It becomes an outcome source, not a feature source.
- All new public tables get GRANTs + RLS in the same migration; snapshot/stat tables are readable by `authenticated`, written only by `service_role`.

## 3. Edge functions and cadence

- `ron-snapshot` — computes features for newest closed bars across tracked symbol/timeframes. Cron every 1 minute, guarded by market hours and a last-bar cursor so work happens only on bar close.
- `ron-label` — resolves outcomes once the forward window has fully elapsed, using 1m/5m data for stop-first/target-first resolution. Cron every 5 minutes, plus a bulk backfill mode.
- `ron-aggregate` — rebuilds `ron_stat_cells` with sample-size and confidence-interval discipline. Hourly or nightly.
- `ron-score` — turns the latest snapshot + stat cells + model signals into `ron_symbol_state`. Runs right after `ron-snapshot`.
- `falconer-engine` — strategy logic unchanged; refactored only to also emit its trigger state into `model_signals` through the adapter interface.
- `gainedge-ai` — refactored to explain stored RON evidence; no numeric invention.

## 4. Retire / keep / refactor

Retire: the `live_market_data` compute path and the dead `triggerMarketDataCompute()`; placeholder confidence and `generateSparkData()`; mock-derived trend labels; leftover legacy RON auto-trade components already rendering null.

Keep frozen: `_shared/falconer-strategy.ts`, session/DST math, parity fixes, the MetaAPI connection and secrets, `metaapi-candles` / `metaapi-backfill`.

Refactor: promote `src/services/pattern-detection.ts` into `supabase/functions/_shared/pattern-detection.ts` so server and client share one implementation. Patterns become snapshot features only — they do not gate Falconer entries, so parity stays intact.

## 5. Dashboard changes

- `DashboardHome.tsx` and `InstrumentTrackingPanel.tsx` read `ron_symbol_state` plus the latest `ron_market_snapshots` via Realtime instead of `live_market_data`.
- Cards show real last price, RON state, trend/regime, RSI/ADX/MACD/StochRSI/ATR%, session, pattern context, evidence score, probability only when calibrated (otherwise "insufficient sample"), a real sparkline built from recent candles, freshness timestamp and a data-health dot.
- One plain-language line per card: direction, state, why, risk context, what must happen next.
- Every fabricated value is removed. Stale data renders as stale rather than as a number.

## 6. Backfilling and training without lookahead

- Replay `candle_history` chronologically; a snapshot at bar *t* may use only bars <= t, and daily context reuses the session-aligned no-lookahead logic proven during the parity work.
- Labels are written only for snapshots whose full forward window is already in the past.
- Split by time, not randomly: train up to a cutoff, validation next block, test most recent block. The split is stored on `ron_stat_cells` so no cell mixes periods.
- Warm start with XAUUSD (dense 1m/15m/1h), then the other 16 symbols on 15m.
- The 665 legacy Falconer rows are used only for sanity comparison, never as feature training data.

## 7. Phases

- **Phase 0 — Truthfulness.** Remove fake confidence, fake sparklines and mock labels; add freshness and data-health indicators; mark stale layers explicitly. No new tables.
- **Phase 1 — Feature store.** `ron_market_snapshots`, shared indicator/pattern library, `ron-snapshot` cron, historical backfill for XAUUSD then all symbols.
- **Phase 2 — Outcome labelling.** `ron_snapshot_outcomes`, `ron-label` cron and bulk backfill.
- **Phase 3 — Empirical probability.** `ron_stat_cells`, `ron-aggregate`, `ron-score`, `ron_symbol_state`, dashboard switched onto RON; `min_setup_score` becomes a real blocking gate in routing (still signal-only).
- **Phase 4 — Network learning.** Consent table, opt-in de-identified contribution pipeline, global vs personal blending with sample-size rules.
- **Phase 5 — Model platform.** `ron_models`, adapter interface, walk-forward comparison, champion/challenger and retirement.

## 8. Acceptance tests

- P0: no fabricated number renders anywhere; stale data renders as stale; existing Falconer parity tests still pass.
- P1: recomputing a historical bar twice yields identical features; no snapshot references a future bar; snapshot coverage matches candle coverage per symbol/timeframe.
- P2: labels reproduce known Falconer trade outcomes on overlapping bars; no label exists whose forward window extends past `now()`; stop-first resolution verified against 1m data on sampled trades.
- P3: every displayed probability has n >= threshold and a confidence interval; calibration (predicted vs realised) within tolerance on the held-out test block; a below-threshold score blocks routing.
- P4: no user_id, account id, balance or name in any contribution row; opting out stops future contributions.
- P5: two models run side by side on identical bars and are comparable without either affecting the other.

## 9. Risks and scale

- Snapshot volume: 19 symbols on 15m is roughly 1.8k rows/day; adding 5m/1m multiplies quickly. Mitigate with per-symbol timeframe allowlists, bar_time indexing/partitioning and a retention policy that keeps features while ageing out duplicated OHLCV.
- Do not fan out crons per subscriber: snapshots are global per symbol/timeframe; only `ron_symbol_state` presentation is user-filtered.
- MetaAPI rate limits and the earlier `context canceled` timeouts: keep chunked, paginated, resumable jobs.
- Statistical risk of over-segmentation producing confident nonsense: enforce minimum sample sizes and always surface confidence intervals.
- Privacy: the global pool must be de-identified at write time, not at read time.

## 10. Recommended first slice

Phase 0 plus the XAUUSD-only backbone of Phase 1: shared indicator/pattern library, `ron_market_snapshots`, `ron-snapshot` for XAUUSD 15m (live cron plus historical backfill over the existing genuine history), and one dashboard card wired to real computed indicators with freshness and data health. Nothing about execution, Falconer logic or probability claims changes in this slice.