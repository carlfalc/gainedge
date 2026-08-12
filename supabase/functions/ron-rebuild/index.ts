/**
 * RON Phase 2C.2 — DURABLE rebuild orchestrator.
 *
 * The clean-lineage rebuild (quality v3 -> feature v4 -> label v5) is driven by persisted
 * rows in public.ron_rebuild_jobs, never by an ephemeral background shell process. Each
 * invocation runs a small number of BOUNDED, IDEMPOTENT worker batches, advances the
 * persisted cursor, records progress/errors and stops. A temporary cron
 * (`ron-rebuild-tick`) calls this until every job reaches the terminal `completed` state,
 * at which point the orchestrator removes that cron itself.
 *
 * It never mutates candle_history and never places orders.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * Ordered pipeline: a stage only starts once every earlier stage is `completed`.
 * Stage names are `<kind>_v<version>` so a new versioned lineage (Phase 2D.1e:
 * quality_v4 -> feature_v5 -> label_v6) is driven by data, never by editing this list.
 */
const STAGE_ORDER = ["quality_v3", "feature_v4", "label_v5", "quality_v4", "feature_v5", "label_v6"] as const;
type Stage = string;

/**
 * Phase 2D.1e frozen source clock — the latest genuine XAUUSD 1m bar recorded at the
 * checkpoint start. The label stage of the v6 lineage is clamped to this instant so the
 * rebuild is reproducible and can never consume 1m data published after the freeze.
 */
const SOURCE_AS_OF_2D1E = "2026-08-12T22:14:00.000Z";

/** `quality_v4` -> { kind: "quality", version: 4 } */
function parseStage(stage: string): { kind: "quality" | "feature" | "label"; version: number } {
  const m = /^(quality|feature|label)_v(\d+)$/.exec(stage);
  if (!m) throw new Error(`unknown rebuild stage: ${stage}`);
  return { kind: m[1] as "quality" | "feature" | "label", version: Number(m[2]) };
}
void STAGE_ORDER;

interface BatchResult {
  next_cursor: string | null;
  advanced: number;   // units of source rows consumed by this batch
  done: boolean;      // the stage has no more work
  detail: Record<string, unknown>;
}

async function callWorker(fn: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`${fn} [${res.status}]: ${text.slice(0, 500)}`);
  if (body?.error) throw new Error(`${fn}: ${body.error}`);
  return body;
}

async function runBatch(stage: Stage, cursor: string | null, endIso: string | null): Promise<BatchResult> {
  const { kind, version } = parseStage(stage);
  if (kind === "quality") {
    const limit = 500;
    const b = await callWorker("ron-quality", {
      start: cursor, end: endIso ?? undefined, limit, quality_version: version, persist: true,
    });
    const inspected = Number(b.inspected ?? 0);
    return {
      next_cursor: b.next_cursor ?? cursor,
      advanced: inspected,
      done: inspected === 0 || inspected < limit,
      detail: { inspected, flags_written: b.flags_written ?? 0, by_rule: b.by_rule ?? {} },
    };
  }
  if (kind === "feature") {
    const limit = 400;
    const b = await callWorker("ron-snapshot", {
      mode: "backfill", start: cursor, end: endIso ?? undefined, limit,
    });
    const targets = Number(b.targets ?? 0);
    return {
      next_cursor: b.next_cursor ?? cursor,
      advanced: targets,
      done: targets === 0 || targets < limit,
      detail: { targets, processed: b.processed ?? 0, skipped_quarantined: b.skipped_quarantined ?? 0 },
    };
  }
  // label stage
  const limit = 300;
  const b = await callWorker("ron-label", {
    mode: "backfill", start: cursor, end: endIso ?? undefined, limit,
    label_version: version, horizons: [60],
    ...(version >= 6 ? { source_as_of: SOURCE_AS_OF_2D1E } : {}),
  });
  const snapshots = Number(b.snapshots ?? 0);
  return {
    next_cursor: b.next_cursor ?? cursor,
    advanced: snapshots,
    done: snapshots === 0 || snapshots < limit,
    detail: { snapshots, rows: b.rows ?? 0 },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const eq = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  };
  let authorized = !!token && !!SERVICE_KEY && eq(token, SERVICE_KEY);
  if (!authorized && token) {
    const { data: ok } = await supabase.rpc("ron_verify_cron_token", { _token: token });
    authorized = ok === true;
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* cron tick */ }
  const maxBatches = Math.max(1, Math.min(Number(body.max_batches ?? 3), 8));

  try {
    const ticks: unknown[] = [];

    for (let i = 0; i < maxBatches; i++) {
      const { data: jobs, error } = await supabase
        .from("ron_rebuild_jobs")
        .select("*")
        .in("status", ["pending", "running"])
        .order("stage_order", { ascending: true })
        .limit(1);
      if (error) throw error;
      const job = jobs?.[0];
      if (!job) break;

      const stage = job.stage as Stage;
      try {
        const res = await runBatch(stage, job.cursor ?? job.range_start ?? null, job.range_end ?? null);
        const processed = Number(job.processed ?? 0) + res.advanced;
        const patch: Record<string, unknown> = {
          status: res.done ? "completed" : "running",
          cursor: res.next_cursor,
          processed,
          batches: Number(job.batches ?? 0) + 1,
          last_error: null,
          last_detail: res.detail,
          completed_at: res.done ? new Date().toISOString() : null,
        };
        const { error: ue } = await supabase.from("ron_rebuild_jobs").update(patch).eq("id", job.id);
        if (ue) throw ue;
        ticks.push({ stage, ...res.detail, done: res.done, cursor: res.next_cursor, processed });
        if (res.done) continue;
      } catch (e) {
        const attempts = Number(job.error_count ?? 0) + 1;
        await supabase.from("ron_rebuild_jobs").update({
          status: attempts >= 10 ? "failed" : "running",
          last_error: String((e as Error)?.message ?? e).slice(0, 1000),
          error_count: attempts,
        }).eq("id", job.id);
        ticks.push({ stage, error: String((e as Error)?.message ?? e) });
        break;
      }
    }

    // ── terminal check: retire the temporary rebuild cron ────────────────
    const { count: openCount, error: ce } = await supabase
      .from("ron_rebuild_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "running"]);
    if (ce) throw ce;
    let retired = false;
    if ((openCount ?? 0) === 0) {
      const { error: fe } = await supabase.rpc("ron_rebuild_finish");
      if (fe) console.error("ron_rebuild_finish failed", fe.message);
      else retired = true;
    }

    return json({ ok: true, ticks, open_jobs: openCount ?? 0, cron_retired: retired });
  } catch (e) {
    console.error("ron-rebuild error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});