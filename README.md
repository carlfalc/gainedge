# GainEdge

GainEdge is a Lovable/Supabase trading workspace built around one deterministic
strategy: **Falconer v7 TP3**.

## Strategy

- Long-only
- Four entry triggers: `tpLong`, `sqzUp`, `swPDL`, `swAL`
- Daily EMA50/EMA200 trend context
- Heiken Ashi, EMA21, ATR14, Bollinger/Keltner squeeze
- Asian-session low and previous-day-low sweeps
- 33/33/34 exits at 1.5R, 3R and 5R
- Breakeven at 1R
- Two-red-Heiken-Ashi exit after breakeven

The shared pure module at
`supabase/functions/_shared/falconer-strategy.ts` is used by both live scanning
and backtesting.

## Execution modes

- Signal only
- MetaApi
- PineConnector

Live MetaApi execution is separately gated by the per-user
`allow_live_execution` confirmation, daily loss cap, maximum open positions,
connected broker ownership and completed-candle evaluation.

## Intelligence

GainEdge AI answers questions from the signed-in user's actual Falconer trades,
settings, engine events and recent stored news. It must identify small samples
and cannot override deterministic execution rules.

## Local development

```bash
npm install
npm run dev
```

Validation:

```bash
npm run build
npm test
```

## Required Supabase secrets

- `METAAPI_TOKEN`
- `METAAPI_MARKET_DATA_ACCOUNT_ID` for service-level market refreshes when no
  user account is supplied
- `LOVABLE_API_KEY`
- Standard Supabase URL, anonymous and service-role keys

Never place broker credentials, MetaApi account IDs or AI keys in source code.
