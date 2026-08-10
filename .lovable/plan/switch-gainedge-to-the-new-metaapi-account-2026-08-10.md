# Switch GainEdge to the new MetaAPI account

New MetaAPI account: `93418490-c45a-4ad3-b84c-64d220ae63b2` (region London, server Eightcap-Demo).
Old account being replaced: `ea940a26-d263-4017-ad2c-0412f8399b69`.

No Falconer strategy, signal, or risk logic changes. `execution_path` stays `signal_only` and `allow_live_execution` stays false.

## Where the token comes from

The MetaAPI token is not your Eightcap password. In the MetaAPI dashboard, open the API access tokens section and create a token with market-data and trading access. It is a long string starting with `eyJ`. Paste it into the secure secret form when prompted — it is never written into code, logs, or the database. Your Eightcap password stays inside MetaAPI only.

## Old references found

- `broker_connections` default row for your user (currently `disconnected`, last error: Eightcap-Demo login 7940685)
- `profiles.metaapi_account_id` for your user
- Secret `METAAPI_MARKET_DATA_ACCOUNT_ID`, read by the `metaapi-candles` function

No account ID is hard-coded in any source file.

## Steps

1. Rotate `METAAPI_TOKEN` via the secure secrets form (no code change).
2. Set `METAAPI_MARKET_DATA_ACCOUNT_ID` to the new account ID.
3. Update the default `broker_connections` row and `profiles.metaapi_account_id` to the new account ID; clear the stale `last_error` and refresh status/balance/equity from MetaAPI.
4. Verify against MetaAPI directly: account deployed, broker connection status connected, synchronized, server reads Eightcap-Demo.
5. Test live pricing for XAUUSD and NAS100, resolving Eightcap symbol suffixes (the previous account exposed `.i`-suffixed symbols such as `EURUSD.i`), and confirm the resolved names in the broker symbol mappings.
6. Fetch fresh 15-minute candles for both symbols and backfill `candle_history` from the new account, then report the latest candle timestamp per symbol.
7. Run the Falconer engine once manually in signal-only mode and confirm it evaluates candles without placing trades.
8. Confirm no reference to the old account ID remains anywhere.

## Technical notes

- Region matters: existing MetaAPI calls target the London client API host; the new account is also London, so no host change is expected, but this is re-confirmed during verification.
- Candle backfill uses the existing `metaapi-backfill` function and the idempotent `bulk_insert_candles` path, so re-running is safe.
- If the broker connection reports disconnected, the fix is on the MetaAPI side (re-enter the Eightcap password there); I stop and report rather than guessing.

## Report delivered at the end

New MetaAPI account status, account ID updated, broker connection updated, Eightcap connection, XAUUSD and NAS100 live price, 15m candles, latest candle timestamp, candle_history updated, Falconer engine test, old references removed, and root cause for anything that fails.