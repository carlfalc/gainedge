/**
 * RON Phase 2C — bounded market-data quality auditor (XAUUSD 15m).
 *
 * POST { start?, end?, limit?, persist? }
 *
 * Reads genuine source bars, runs the deterministic quality_version=1 detector and
 * upserts flags into public.ron_data_quality_flags. It NEVER writes, repairs or deletes
 * candle_history. Reruns of the same slice are idempotent by construction: the flag
 * identity is (symbol, timeframe, bar_time, quality_version, rule_code) and the evidence
 * hash is a pure function of the stored source data.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { xauVenueOpen, classifyRonSession } from "../_shared/ron-sessions.ts";
import {
  detectBarQuality, evidenceHash, RON_QUALITY_VERSION,
  type ChildBar, type QualityFlag,
} from "../_shared/ron-data-quality.ts";

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const BAR_MINUTES = 15;
const BAR_MS = BAR_MINUTES * 60_000;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const eq = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  };
  let authorized = !!token && !!serviceKey && eq(token, serviceKey);
  if (!authorized && token) {
    const { data: ok } = await supabase.rpc("ron_verify_cron_token", { _token: token });
    authorized = ok === true;
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const limit = Math.max(1, Math.min(Number(body.limit ?? 500), 1000));
  const persist = body.persist !== false;
  /** Pin an explicit quality_version for audit replay; defaults to the current one. */
  const qualityVersion = Math.max(1, Math.min(Number(body.quality_version ?? RON_QUALITY_VERSION), RON_QUALITY_VERSION));
  /**
   * `mode: "live"` — idempotent maintenance sweep over recently ingested bars so newly
   * persisted artifacts are flagged without a full historical walk.
   */
  const liveMode = body.mode === "live";
  const liveLookbackHours = Math.max(1, Math.min(Number(body.lookback_hours ?? 72), 720));
  /** `all: true` walks the whole history in sequential bounded batches (same detector). */
  const walkAll = body.all === true;
  const maxBatches = walkAll ? Math.max(1, Math.min(Number(body.max_batches ?? 40), 60)) : 1;

  const runBatch = async (startIso: string | null) => {
    let q = supabase
      .from("candle_history")
      .select("timestamp, open, high, low, close, volume, created_at")
      .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
      .order("timestamp", { ascending: true }).limit(limit);
    if (startIso) q = q.gte("timestamp", startIso);
    if (body.end) q = q.lte("timestamp", new Date(body.end).toISOString());
    const { data: bars, error } = await q;
    if (error) throw error;
    if (!bars?.length) return null;

    const first = new Date(bars[0].timestamp).getTime();
    const last = new Date(bars[bars.length - 1].timestamp).getTime() + BAR_MS;

    // ── genuine 1m children for the whole slice (paged) ────────────────
    const children = new Map<number, ChildBar[]>();
    let cursor = new Date(first).toISOString();
    for (let page = 0; page < 60; page++) {
      const { data, error: ce } = await supabase
        .from("candle_history")
        .select("timestamp, open, high, low, close")
        .eq("symbol", SYMBOL).eq("timeframe", "1m")
        .gte("timestamp", cursor).lt("timestamp", new Date(last).toISOString())
        .order("timestamp", { ascending: true }).limit(1000);
      if (ce) throw ce;
      if (!data?.length) break;
      for (const c of data) {
        const t = new Date(c.timestamp).getTime();
        const key = Math.floor((t - first) / BAR_MS) * BAR_MS + first;
        const arr = children.get(key) ?? [];
        arr.push({ time: t, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close) });
        children.set(key, arr);
      }
      if (data.length < 1000) break;
      cursor = new Date(new Date(data[data.length - 1].timestamp).getTime() + 1).toISOString();
    }

    // ── detect ─────────────────────────────────────────────────────────
    const byRule: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const bySession: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    const venueBreakBars: string[] = [];
    const prematureBars: { bar_time: string; evidence: Record<string, unknown> }[] = [];
    const reconciliationFailures: { bar_time: string; evidence: Record<string, unknown> }[] = [];
    let verifiable = 0, unverifiable = 0, clean = 0;
    const rows: Record<string, unknown>[] = [];
    const hashes: Record<string, string> = {};

    for (const b of bars) {
      const t = new Date(b.timestamp).getTime();
      const bar = {
        time: t, open: Number(b.open), high: Number(b.high),
        low: Number(b.low), close: Number(b.close),
        volume: b.volume == null ? null : Number(b.volume),
        created_at: (b as any).created_at ? new Date((b as any).created_at).getTime() : null,
      };
      const kids = children.get(t) ?? [];
      const flags: QualityFlag[] = detectBarQuality(bar, kids, {
        barMinutes: BAR_MINUTES, venueOpen: xauVenueOpen, qualityVersion,
      });
      if (!flags.length) { clean++; verifiable++; continue; }

      for (const f of flags) {
        const sess = classifyRonSession(t).session;
        const month = f.bar_time.slice(0, 7);
        byRule[f.rule_code] = (byRule[f.rule_code] ?? 0) + 1;
        bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
        bySession[`${f.rule_code}:${sess}`] = (bySession[`${f.rule_code}:${sess}`] ?? 0) + 1;
        byMonth[`${f.rule_code}:${month}`] = (byMonth[`${f.rule_code}:${month}`] ?? 0) + 1;
        if (f.rule_code === "venue_break_bar") venueBreakBars.push(f.bar_time);
        if (f.rule_code === "premature_bar_persisted") prematureBars.push({ bar_time: f.bar_time, evidence: f.evidence });
        if (f.rule_code === "unverifiable_1m_coverage") unverifiable++; else verifiable++;
        if (f.rule_code === "ohlc_reconciliation_mismatch") {
          reconciliationFailures.push({ bar_time: f.bar_time, evidence: f.evidence });
        }
        const hash = await evidenceHash(SYMBOL, TIMEFRAME, f);
        hashes[`${f.bar_time}|${f.rule_code}`] = hash;
        rows.push({
          symbol: SYMBOL, timeframe: TIMEFRAME, bar_time: f.bar_time,
          quality_version: f.quality_version, rule_code: f.rule_code, severity: f.severity,
          evidence: f.evidence, evidence_hash: hash,
          detector: "ron-quality", provenance: "candle_history",
          detected_at: new Date().toISOString(),
        });
      }
    }

    if (persist) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error: ue } = await supabase.from("ron_data_quality_flags")
          .upsert(rows.slice(i, i + 200), { onConflict: "symbol,timeframe,bar_time,quality_version,rule_code" });
        if (ue) throw ue;
      }
    }

    return {
      ok: true,
      quality_version: qualityVersion,
      persisted: persist,
      inspected: bars.length,
      first_bar: new Date(first).toISOString(),
      last_bar: new Date(last - BAR_MS).toISOString(),
      clean_bars: clean,
      child_coverage: { verifiable, unverifiable },
      flags_written: rows.length,
      by_rule: byRule, by_severity: bySeverity, by_session: bySession, by_month: byMonth,
      venue_break_bars: venueBreakBars,
      premature_bars: prematureBars,
      reconciliation_failures: reconciliationFailures,
      hashes: body.with_hashes ? hashes : undefined,
      next_cursor: new Date(new Date(bars[bars.length - 1].timestamp).getTime() + 1).toISOString(),
    };
  };

  try {
    let cursor: string | null = body.start ? new Date(body.start).toISOString() : null;
    const batches: any[] = [];
    for (let i = 0; i < maxBatches; i++) {
      const res = await runBatch(cursor);
      if (!res) break;
      batches.push(res);
      cursor = res.next_cursor;
      if (res.inspected < limit) break;
    }
    if (!batches.length) return json({ ok: true, inspected: 0, note: "no source bars in range" });
    if (batches.length === 1) return json(batches[0]);

    // Aggregate the sequential bounded batches into one deterministic audit report.
    const add = (t: Record<string, number>, s: Record<string, number>) => {
      for (const [k, v] of Object.entries(s)) t[k] = (t[k] ?? 0) + v;
    };
    const agg = {
      ok: true, quality_version: RON_QUALITY_VERSION, persisted: persist,
      batches: batches.length,
      inspected: 0, clean_bars: 0, flags_written: 0,
      child_coverage: { verifiable: 0, unverifiable: 0 },
      by_rule: {} as Record<string, number>, by_severity: {} as Record<string, number>,
      by_session: {} as Record<string, number>, by_month: {} as Record<string, number>,
      venue_break_bars: [] as string[],
      reconciliation_failures: [] as unknown[],
      first_bar: batches[0].first_bar,
      last_bar: batches[batches.length - 1].last_bar,
      next_cursor: batches[batches.length - 1].next_cursor,
    };
    for (const b of batches) {
      agg.inspected += b.inspected; agg.clean_bars += b.clean_bars; agg.flags_written += b.flags_written;
      agg.child_coverage.verifiable += b.child_coverage.verifiable;
      agg.child_coverage.unverifiable += b.child_coverage.unverifiable;
      add(agg.by_rule, b.by_rule); add(agg.by_severity, b.by_severity);
      add(agg.by_session, b.by_session); add(agg.by_month, b.by_month);
      agg.venue_break_bars.push(...b.venue_break_bars);
      agg.reconciliation_failures.push(...b.reconciliation_failures);
    }
    return json(agg);
  } catch (e) {
    console.error("ron-quality error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
