/**
 * GAINEDGE_GDELT_SERVER_SCHEDULE_V1 — server-side pg_cron schedule for the internal
 * `ingest-macro-headlines` GDELT raw ingestion function. Code + tests only; the
 * migration is staged, never applied by this slice.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const BASE = "563e97b4155a2f8f850a055a9e92619153fad304";
const FILE = "supabase/migrations/20260817110900_ingest_macro_headlines_cron.sql";
const SQL = readFileSync(FILE, "utf8");
const JOB = "ingest-macro-headlines-2m";
/** Executable SQL only (comments stripped), with the shared Vault secret name removed so
 *  prose and the accepted credential source cannot satisfy scope assertions. */
const CODE = SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .toLowerCase().replaceAll("falconer_service_role_key", "<vault_secret>");

describe("schedule contract", () => {
  it("adds exactly one new migration file for this slice", () => {
    const added = execSync(
      `git diff --name-status ${BASE} -- supabase/migrations`, { encoding: "utf8" },
    ).trim().split("\n").filter(Boolean);
    // Later authorized slices may add their own migrations; this slice adds exactly one
    // and modifies or deletes none.
    expect(added.filter((l) => !l.startsWith("A\t"))).toEqual([]);
    expect(added.filter((l) => l.includes("ingest_macro_headlines_cron"))).toEqual([`A\t${FILE}`]);
  });


  it("uses the exact schedule name and cadence", () => {
    expect(SQL).toContain(`cron.schedule(\n  '${JOB}',\n  '*/2 * * * *',`);
    expect(SQL.match(/cron\.schedule\(/g)).toHaveLength(1);
    const crons = [...SQL.matchAll(/'(\S+ \S+ \S+ \S+ \S+)'/g)].map((m) => m[1]);
    expect(crons).toEqual(["*/2 * * * *"]);
  });

  it("posts an empty JSON body to the exact function path with JSON content type", () => {
    expect(SQL).toContain("net.http_post(");
    expect(SQL).toContain("/functions/v1/ingest-macro-headlines'");
    expect(SQL).toContain("body := '{}'::jsonb");
    expect(SQL).toContain("'Content-Type', 'application/json'");
    for (const banned of ["symbol", "instrument", "timeframe", "user_id", "probability",
      "execution", "strategy"]) expect(CODE).not.toContain(banned);
  });

  it("sources auth through Vault, with no literal key or token value", () => {
    expect(SQL).toContain("vault.decrypted_secrets");
    expect(SQL).toContain("'Bearer ' || coalesce(");
    expect(SQL).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(SQL).not.toMatch(/sb_(secret|publishable)_/);
    expect(SQL).not.toMatch(/service_role_key['"]?\s*(:=|=)\s*'[^']+'/);
  });

  it("is idempotent for that schedule name", () => {
    expect(SQL).toContain(`perform cron.unschedule('${JOB}')`);
    expect(SQL.indexOf("cron.unschedule")).toBeLessThan(SQL.indexOf("cron.schedule("));
    expect(SQL).toContain("exception when others then");
  });

  it("schedules nothing else", () => {
    for (const banned of ["ron-", "falconer", "research", "orchestrat", "fetch-news",
      "metaapi", "calibrat"]) expect(CODE).not.toContain(banned);
    const posts = [...SQL.matchAll(/\/functions\/v1\/([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(posts).toEqual(["ingest-macro-headlines"]);
  });
});

describe("frozen surfaces untouched", () => {
  it("leaves the GDELT function, RON, strategy, UI, CI and existing migrations byte-identical", () => {
    const diff = execSync(
      `git diff ${BASE} -- src supabase strategy .lovable .github`
      + ` ':(exclude)${FILE}'`
      + ` ':(exclude)src/test/gainedge-gdelt-server-schedule-v1.test.ts'`
      // Migration-hygiene allowlist entry for this slice's schedule-definition migration.
      + ` ':(exclude)src/test/migration-hygiene.test.ts'`
      // Older freeze guards narrowed to exclude this slice's new, additive migration.
      + ` ':(exclude)src/test/gainedge-gdelt-raw-headlines-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-ask-ron-global-context-bridge-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-product-ask-ron-global-entry-v1.test.ts'`
      // GAINEDGE_24X7_CANDLE_RON_RUNTIME_V1: additive, newly authorized scheduler,
      // its schedule migrations and the ron-orchestrate-run boot fix it depends on.
      + ` ':(exclude)supabase/functions/ron-schedule-orchestration'`
      + ` ':(exclude)supabase/functions/ron-orchestrate-run/index.ts'`
      + ` ':(exclude)supabase/migrations/20260821061910_bfc73e53-1fc1-4b70-bffb-8e1b54cdf36b.sql'`
      + ` ':(exclude)supabase/migrations/20260821061932_53b5b8ea-752a-4845-9ac2-8f2b272589b8.sql'`
      + ` ':(exclude)src/test/gainedge-24x7-candle-ron-runtime-v1.test.ts'`
      // Auto-generated backend types regenerate when a migration is applied.
      + ` ':(exclude)src/integrations/supabase/types.ts'`
      // GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V3: authorized, additive single-anchor stack
      // (Session/Pattern/Cross-Asset/Opportunity V3 specs, Orchestration V8, the four
      // specialist endpoints' additive V3 branches, the coordinator, the scheduler pin
      // and this slice's own tests). No frozen V1-V7 artifact is modified.
      + ` ':(exclude)supabase/functions/_shared/ron-session-structure-spec-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-pattern-structure-context-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-cross-asset-relationship-context-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-risk-spec-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-orchestration-run-v8.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-session-structure/index.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-pattern-context/index.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-cross-asset-correlation/index.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-opportunity-risk/index.ts'`
      + ` ':(exclude)supabase/functions/ron-orchestrate-run/index.ts'`
      + ` ':(exclude)supabase/functions/ron-schedule-orchestration'`
      + ` ':(exclude)src/test/gainedge-ron-live-anchor-compat-v3.test.ts'`
      + ` ':(exclude)src/test/gainedge-24x7-candle-ron-runtime-v1.test.ts'`
      + ` ':(exclude)src/test/migration-hygiene.test.ts'`,
      { encoding: "utf8" },
    );
    expect(diff.trim()).toBe("");
    const ron = execSync(
      "git diff ed8c9773b29a1748f8173551241e898e11b2c314 --"
      + " src/test/ron-orchestration-run-v5.test.ts src/test/ron-orchestration-run-v6.test.ts",
      { encoding: "utf8" },
    );
    expect(ron.trim()).toBe("");
  });

  it("adds no browser or dashboard invocation of the ingestion function", () => {
    const hits = execSync(
      "git grep -l ingest-macro-headlines -- src ':(exclude)src/test' || true",
      { encoding: "utf8" },
    ).trim().split("\n").filter(Boolean);
    expect(hits).toEqual([]);
  });

  it("keeps the migration directory otherwise untouched", () => {
    const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
    expect(files).toContain("20260817110900_ingest_macro_headlines_cron.sql");
  });
});
