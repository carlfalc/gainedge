/**
 * GAINEDGE_GDELT_RAW_HEADLINES_V1 — internal, service-role-only RAW headline ingestion.
 *
 * Appends GDELT DOC 2.0 artlist rows to `public.macro_source_events` ONLY.
 * It never writes `news_items`, never touches any RON table, never calls an LLM or
 * embedding model, and produces no sentiment/direction/impact/probability/causal claim.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  GDELT_PROVIDER, GDELT_QUERY_BUCKETS, buildBucketUrl, normalizeArticle,
  type MacroSourceEventRow,
} from "./gdelt-doc2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !serviceKey || !timingSafeEq(token, serviceKey)) {
    return json({ error: "unauthorized: internal service-role endpoint" }, 401);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let fetched = 0, accepted = 0, inserted = 0, duplicates = 0, malformed = 0;
  const buckets: Array<Record<string, unknown>> = [];

  for (const { bucket, query } of GDELT_QUERY_BUCKETS) {
    const summary: Record<string, unknown> = { bucket, fetched: 0, accepted: 0, inserted: 0, duplicates: 0, malformed: 0 };
    buckets.push(summary);
    try {
      const res = await fetch(buildBucketUrl(query), { headers: { accept: "application/json" } });
      if (!res.ok) {
        summary.error = `provider_http_${res.status}`;
        continue;
      }
      const payload = await res.json().catch(() => null) as { articles?: unknown[] } | null;
      const articles = Array.isArray(payload?.articles) ? payload!.articles! : [];
      summary.fetched = articles.length;
      fetched += articles.length;

      const rows: MacroSourceEventRow[] = [];
      const seen = new Set<string>();
      for (const raw of articles) {
        const norm = await normalizeArticle(raw, bucket);
        if (!norm.ok) { malformed++; summary.malformed = (summary.malformed as number) + 1; continue; }
        if (seen.has(norm.row.provider_event_id)) { duplicates++; summary.duplicates = (summary.duplicates as number) + 1; continue; }
        seen.add(norm.row.provider_event_id);
        rows.push(norm.row);
      }
      accepted += rows.length;
      summary.accepted = rows.length;
      if (rows.length === 0) continue;

      // Append-only: on conflict DO NOTHING — existing rows keep their original
      // ingested_at and first-stored query_bucket.
      const { data, error } = await db
        .from("macro_source_events")
        .upsert(rows, { onConflict: "provider,provider_event_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        summary.error = "persist_failed";
        continue;
      }
      const n = data?.length ?? 0;
      inserted += n;
      summary.inserted = n;
      const dup = rows.length - n;
      duplicates += dup;
      summary.duplicates = (summary.duplicates as number) + dup;
    } catch (err) {
      // Safe logging: message only, never payloads or secrets.
      summary.error = String((err as Error)?.message ?? "bucket_failed").slice(0, 200);
    }
  }

  const allFailed = buckets.every((b) => typeof b.error === "string");
  return json({
    success: !allFailed,
    provider: GDELT_PROVIDER,
    fetched, accepted, inserted, duplicates, malformed, buckets,
  }, allFailed ? 502 : 200);
});
