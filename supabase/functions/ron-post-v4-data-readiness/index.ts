/**
 * RON 2D.2x — READ-ONLY post-freeze confirmatory-data readiness observer.
 *
 * POST { confirmation_start: ISO, end?: ISO, source_as_of?: ISO }
 *
 * Reads only the accepted V4 lineage (quality v5 / feature v6 / label v7), counts genuine
 * eligible long/short observations after the explicit boundary, and reports venue-aware
 * continuity. It NEVER persists, runs research, accepts a contract, unlocks probability,
 * promotes a candidate, or touches execution.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  CALIBRATION_BARRIER_ATR_MULT,
  CALIBRATION_BARRIER_VERSION,
  CALIBRATION_CONTRACT_V8,
  CALIBRATION_HORIZON_MINUTES,
  INELIGIBLE_ANCHOR_SESSIONS,
  NoGenuineSourceClockError,
  anchorSessionEligible,
  deriveSourceBarCutoff,
  eligibleFor,
  resolveSourceClockV2,
  type CalibrationInputRow,
  type Direction,
} from "../_shared/ron-calibration.ts";
import { loadQuarantinedBarTimes } from "../_shared/ron-quality-contract.ts";
import { analyseContinuityV4 } from "../_shared/ron-research-v4.ts";
import { summarizePostV4DataReadiness } from "../_shared/ron-post-v4-data-readiness.ts";

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const QUALITY_VERSION = 5;
const PAGE = 1000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const iso = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.length) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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
  if (!authorized) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const confirmationStart = iso(body.confirmation_start);
  if (!confirmationStart) return json({ error: "missing_or_malformed_confirmation_start" }, 400);
  const requestedEnd = body.end == null ? null : iso(body.end);
  if (body.end != null && !requestedEnd) return json({ error: "malformed_end" }, 400);
  const explicitAsOf = body.source_as_of == null ? null : iso(body.source_as_of);
  if (body.source_as_of != null && !explicitAsOf) return json({ error: "malformed_source_as_of" }, 400);

  try {
    let latest1m: string | null = null;
    if (!explicitAsOf) {
      const { data, error } = await supabase.from("candle_history")
        .select("timestamp")
        .eq("symbol", SYMBOL).eq("timeframe", "1m")
        .order("timestamp", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      latest1m = (data as { timestamp?: string } | null)?.timestamp ?? null;
    }
    const clock = resolveSourceClockV2(explicitAsOf, latest1m);
    const sourceBarCutoff = deriveSourceBarCutoff(clock.source_as_of);
    const effectiveEnd = requestedEnd && requestedEnd < sourceBarCutoff ? requestedEnd : sourceBarCutoff;
    if (effectiveEnd < confirmationStart) {
      return json({ error: "no_post_boundary_source_window", confirmation_start: confirmationStart,
        source_bar_cutoff: sourceBarCutoff }, 422);
    }

    const outcomes: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from("ron_snapshot_outcomes")
        .select("bar_time, session, atr_at_anchor, coverage_ok, coverage_class, long_event_eligible, long_success, short_event_eligible, short_success, barrier_atr_mult, barrier_version")
        .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
        .eq("feature_version", CALIBRATION_CONTRACT_V8.feature_version)
        .eq("label_version", CALIBRATION_CONTRACT_V8.label_version)
        .eq("horizon_minutes", CALIBRATION_HORIZON_MINUTES)
        .gte("bar_time", confirmationStart).lte("bar_time", effectiveEnd)
        .order("bar_time", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data ?? [];
      outcomes.push(...rows);
      if (rows.length < PAGE) break;
    }

    const snapshots = new Map<string, Record<string, unknown>>();
    const featureGridTimes: number[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from("ron_market_snapshots")
        .select("bar_time, features")
        .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
        .eq("feature_version", CALIBRATION_CONTRACT_V8.feature_version)
        .gte("bar_time", confirmationStart).lte("bar_time", effectiveEnd)
        .order("bar_time", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data ?? [];
      for (const r of rows as Array<{ bar_time: string; features: Record<string, unknown> | null }>) {
        const t = new Date(r.bar_time).toISOString();
        snapshots.set(t, r.features ?? {});
        featureGridTimes.push(Date.parse(t));
      }
      if (rows.length < PAGE) break;
    }

    const quarantined = await loadQuarantinedBarTimes(
      supabase, SYMBOL, TIMEFRAME, QUALITY_VERSION, PAGE,
    );
    const eligibleGridTimes = featureGridTimes
      .filter((t) => !quarantined.has(new Date(t).toISOString()))
      .sort((a, b) => a - b);
    const continuity = analyseContinuityV4(eligibleGridTimes);

    const exclusions: Record<string, number> = {};
    const bump = (reason: string) => { exclusions[reason] = (exclusions[reason] ?? 0) + 1; };
    const counts: Record<Direction, number> = { long: 0, short: 0 };

    for (const o of outcomes) {
      const barTime = new Date(o.bar_time).toISOString();
      if (quarantined.has(barTime)) { bump("quarantined_quality_v5"); continue; }
      const features = snapshots.get(barTime);
      if (!features) { bump("missing_feature_v6_snapshot"); continue; }
      if (Number(o.barrier_atr_mult) !== CALIBRATION_BARRIER_ATR_MULT
        || Number(o.barrier_version) !== CALIBRATION_BARRIER_VERSION) {
        bump("barrier_definition_mismatch");
        continue;
      }
      const row: CalibrationInputRow = {
        bar_time: barTime,
        session: o.session ?? null,
        regime: (features as any).regime ?? null,
        adx: typeof (features as any).adx14 === "number" ? (features as any).adx14 : null,
        long_event_eligible: o.long_event_eligible === true,
        long_success: o.long_success,
        short_event_eligible: o.short_event_eligible === true,
        short_success: o.short_success,
        coverage_ok: o.coverage_ok === true,
        coverage_class: o.coverage_class ?? "other_incomplete",
        atr_at_anchor: o.atr_at_anchor == null ? null : Number(o.atr_at_anchor),
      };
      if (!row.coverage_ok || row.coverage_class !== "complete") {
        bump(`coverage:${row.coverage_class}`);
      } else if (row.atr_at_anchor == null) {
        bump("missing_atr");
      } else if (!anchorSessionEligible(row.session)) {
        bump(`session:${row.session ?? INELIGIBLE_ANCHOR_SESSIONS[0]}`);
      }
      for (const direction of ["long", "short"] as Direction[]) {
        if (eligibleFor(row, direction)) counts[direction]++;
        else bump(`${direction}:ineligible`);
      }
    }

    const summary = summarizePostV4DataReadiness({
      confirmation_start: confirmationStart,
      effective_end: effectiveEnd,
      source_as_of: clock.source_as_of,
      source_bar_cutoff: sourceBarCutoff,
      feature_grid_bars: eligibleGridTimes.length,
      continuity_splitting_defects: continuity.splitting_defects,
      continuity_defects: continuity.defects.length,
      eligible_long: counts.long,
      eligible_short: counts.short,
      exclusions,
    });

    return json({
      ok: true,
      read_only: true,
      source_clock: clock.source_clock,
      lineage: {
        symbol: SYMBOL,
        timeframe: TIMEFRAME,
        quality_version: QUALITY_VERSION,
        feature_version: CALIBRATION_CONTRACT_V8.feature_version,
        label_version: CALIBRATION_CONTRACT_V8.label_version,
      },
      summary,
      continuity,
    });
  } catch (e) {
    if (e instanceof NoGenuineSourceClockError) return json({ error: "NO_GENUINE_SOURCE_CLOCK" }, 503);
    console.error("ron-post-v4-data-readiness error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
