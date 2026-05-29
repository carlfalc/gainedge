
# Falconer v7 TP3 — Full Strategy Replacement

Wipe every existing signal/strategy engine and replace with a single TypeScript port of the Pine Script `Falconer v7 TP3 33-33-34` strategy. Longs only, 3-tier scaled TPs (33/33/34 at 1.5R/3R/5R), breakeven at 1R, HA-flip exit after BE. Two execution paths per user: native MetaApi auto-trade, or PineConnector webhook string emitted to the user's own PineConnector URL.

## 1. Wipe (delete entirely)

**Edge functions:**
- `ron-auto-trade` (V3 DLO/Squeeze)
- `compute-market-data` (V1/V2 signal generation)
- `ron-intelligence`, `ron-backtest`, `v1-backtest`, `v2-precision-backtest`
- `ron-ml`-related calls (Render service no longer used)
- `push-scan`, `push-insights` (legacy scan loop)

**Tables (DROP):**
- `signals`, `signal_outcomes`, `scan_results`
- `ron_auto_trades`, `ron_backtest_runs`, `ron_calibration`, `ron_platform_intelligence`, `ron_risk_metrics`, `ron_settings`
- `pattern_weights`, `falconer_knowledge`, `liquidity_zones`
- `backtest_results` (old EMA backtest)
- `auto_trade_executions` — replaced by new table

**Cron jobs:** remove all `pg_cron` schedules tied to the above functions.

**UI removed:**
- RonVersionSelector, AskRon, FalconerRules/Performance/Preferences panels
- V1/V2/V3 references in Dashboard, Signals page filters, Auto-Trade page
- Old BacktestsAdminPage, BacktestingPage engines

## 2. New backend

**One new table — `falconer_trades`:**
Stores every entry, partial fill, BE move, and final close for both live and backtest runs. Columns: user_id, symbol, timeframe, mode (`live` | `backtest` | `dry_run`), execution_path (`metaapi` | `pineconnector` | `signal_only`), direction (always `long`), entry/sl/tp1/tp2/tp3/be_level prices, qty + qty1/qty2/qty3, trigger (`tpLong` | `sqzUp` | `swPDL` | `swAL`), status (`open` | `tp1_hit` | `tp2_hit` | `tp3_hit` | `be_active` | `closed_ha_flip` | `closed_sl`), pnl_usd, opened_at, closed_at, raw_alert_payload jsonb.

**One new table — `falconer_settings`:**
Per-user config replacing `ron_settings`. Columns: user_id (unique), enabled (bool), execution_path enum, symbols text[], timeframe text default `15m`, risk_usd numeric default 200, all strategy inputs (rrTP1/2/3, beR, pct1, pct2, minATRp, maxATRp, pullbackTol), pineconnector_license, pineconnector_symbol_override jsonb (per-symbol broker symbol), pineconnector_risk numeric, pineconnector_webhook_url text.

**One new edge function — `falconer-engine`:**
Single TS port of the Pine logic. Runs on cron every 5 minutes (gate by candle-close for the user's timeframe). For each enabled user × symbol:
1. Load last ~500 candles at user's timeframe + daily candles for EMA50/EMA200/PDL.
2. Compute Heiken Ashi, EMA9/21, daily EMA50/200, ATR14, Bollinger(20,2), Keltner(20,1.5) → squeeze, Asian session 22:00–06:00 UTC hi/lo lock, PDL.
3. Evaluate 4 long triggers (`tpLong`, `sqzUp`, `swPDL`, `swAL`) + ATR/HA/trend filters.
4. On new long signal with no open position: compute entry=close, SL=min(low, low[-1]) − 0.25×ATR, three TPs, BE level, qty split 33/33/34.
5. Route execution:
   - `metaapi` → 3 `metaapi-trade` calls (one per TP leg) with shared SL.
   - `pineconnector` → POST the exact Pine alert string to user's webhook URL.
   - `signal_only` → write to `falconer_trades` for UI display, no execution.
6. Position management on each run: if `high ≥ beLvl` and not BE-done, move SL to entry on remaining legs (+ emit BE webhook). If `beDone` and two consecutive HA-red candles, close remainder (+ emit closelong webhook).

**One new edge function — `falconer-backtest`:**
Same TS module imported, replayed bar-by-bar over `candle_history` for a symbol/timeframe/date range. Returns equity curve, trades array, drawdown, win rate, profit factor, net P&L. Writes to `falconer_trades` with `mode='backtest'` + a `backtest_runs` row.

**Shared TS module — `supabase/functions/_shared/falconer-strategy.ts`:**
Pure functions (HA, EMA, ATR, BB, KC, squeeze, session lock, trigger detection, position state machine). Used by both `falconer-engine` and `falconer-backtest` so live + backtest are byte-identical.

**Cron:** one schedule, every 5 min, calls `falconer-engine`.

## 3. New UI

**Single Strategy page (`/dashboard/strategy`)** replacing Auto-Trade + Signals strategy controls:
- Enable toggle + execution path radio (MetaApi / PineConnector / Signal only)
- Symbol multi-select (defaults: XAUUSD), timeframe (default 15m)
- Risk inputs (USD risk, TP1/TP2/TP3 R multiples, BE R, % splits)
- PineConnector section (visible when path = pineconnector): webhook URL, license ID, per-symbol broker symbol map, PC risk %
- Live trades table (realtime on `falconer_trades` where mode=live)
- Recent alert payloads (raw strings emitted) for debugging webhook setup

**Backtest page** rewritten:
- Symbol + timeframe + date range + same risk inputs
- Run button → calls `falconer-backtest`
- Results: equity curve, trade list, stats matching the Pine output format

**Dashboard / Signals page:** strip engine selectors; show Falconer trades feed only.

## 4. PineConnector alert format (exact match to Pine)

Entry:
```
{license},buy,{symbol},risk={pcRisk},sl={sl},tp1={tp1},tp1size=33,tp2={tp2},tp2size=33,tp3={tp3},tp3size=34,comment=v7TP3_entry
```
BE: `{license},breakeven,{symbol},comment=v7TP3_BE`
HA-flip close: `{license},closelong,{symbol},comment=v7TP3_HAflip`

Emitted via plain HTTPS POST to the user-supplied webhook URL with `Content-Type: text/plain`.

## 5. Memory updates

Rewrite all `mem://tech/intelligence/*`, `mem://features/signals/*`, and `mem://features/trading/auto-trade-execution` memories to reference Falconer v7 TP3 only. Update Core index to remove EMA 4/17 V1 Legacy rule.

## 6. Order of execution

1. Migration: drop old tables/cron, create `falconer_trades` + `falconer_settings` with GRANTs and RLS.
2. Delete old edge functions (`supabase--delete_edge_functions`).
3. Create `_shared/falconer-strategy.ts`, `falconer-engine`, `falconer-backtest`.
4. Schedule new cron.
5. Rebuild Strategy page + Backtest page; remove old UI surfaces and routes.
6. Update memory files.
7. Verify: dry-run `falconer-engine` against XAUUSD 15m and run a backtest matching the Pine window (Dec 1 2025 – May 14 2026) to confirm parity.

## Open question before I build

The Pine references daily EMA50/EMA200 and Asian session lock — those require daily candles and continuous 15m history. `candle_history` currently only has reliable XAUUSD 15m from Dec 9 2024. For non-XAUUSD symbols and the daily timeframe, I'll need to either (a) backfill via the existing Dukascopy ingestion before enabling live, or (b) gate the engine to symbols/timeframes that have ≥ 250 daily candles. I'll implement (b) as a safety check and surface a "Backfill required" badge per symbol on the Strategy page.

