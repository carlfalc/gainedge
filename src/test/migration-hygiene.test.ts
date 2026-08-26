/**
 * Repository guard: migrations must be schema/infra definitions, never test harnesses.
 *
 * Forbidden tokens (`net.http_post`, `vault.decrypted_secrets`,
 * `email_queue_service_role_key`, `/ron-calibrate`) are only allowed in migrations
 * explicitly allowlisted below, and only because they DEFINE cron/queue infrastructure
 * (CREATE FUNCTION / cron.schedule bodies) rather than executing side effects at replay.
 *
 * The four Phase 2B.2 acceptance-test migration versions are additionally guarded:
 * they must stay inert (no DO block, no executable side effect) forever.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(__dirname, "../../supabase/migrations");

const FORBIDDEN = [
  "net.http_post",
  "vault.decrypted_secrets",
  "email_queue_service_role_key",
  "/ron-calibrate",
];

/** Historical migrations that legitimately define email/cron infrastructure. */
const ALLOWLIST = new Set([
  "20260413013122_email_infra.sql",
  "20260529123001_8b235643-4ddd-41ee-a78a-168e063b3b56.sql",
  "20260531120000_falconer_cron_vault_auth.sql",
  "20260725082428_3e7d2904-4d43-4038-a0b5-a42e2efe1781.sql",
  "20260810112647_41818f50-520c-4c55-8f92-163f57166f00.sql",
  "20260810122413_cc8c3dac-4e84-4531-bcd3-5fd39c5f19f7.sql",
  "20260810125844_1c92e129-7557-46c2-a137-602a0a370d86.sql",
  "20260810130050_3d4885c1-ede9-4a8f-963d-e5b66cbf19ac.sql",
  "20260811094250_966a9df3-5f18-4329-b506-3c075b7bfc99.sql",
  "20260811112827_4b92214e-52e5-4653-893f-8524cc24893b.sql",
  "20260811125005_a8c0be90-3830-4240-9d58-084cfa94c0e9.sql",
  "20260812030646_8e61d41e-97b6-4820-9ae2-562571a1196d.sql",
  // Phase 2D.1: CREATE FUNCTION body for public.ron_invoke_worker (worker allowlist only).
  "20260812072740_c3f6ce80-55cd-4304-9c71-5606fef3d117.sql",
  // Phase 2D.2b-CORR: CREATE FUNCTION body re-declaring public.ron_invoke_worker with the
  // permanent 'ron-agent-session-structure' allow-list entry. Definition + REVOKE/GRANT
  // only; it invokes nothing at replay.
  "20260813090242_525bbba0-acde-406d-8eb7-e5d27af09b0f.sql",
  // GAINEDGE_GDELT_SERVER_SCHEDULE_V1: cron.schedule definition for the internal raw
  // GDELT headline ingestion function. Schedule definition only; no side effect at replay
  // beyond (re)registering the named job.
  "20260817110900_ingest_macro_headlines_cron.sql",
  // GAINEDGE_24X7_CANDLE_RON_RUNTIME_V1: cron.schedule + tick-function definition for the
  // internal RON scheduler (XAUUSD 15m stored decision records only). Definition only; no
  // side effect at replay beyond (re)registering the named job.
  "20260821061910_bfc73e53-1fc1-4b70-bffb-8e1b54cdf36b.sql",
  // GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1: health-watchdog table plus cron tick-function
  // definitions for the always-on multi-instrument runtime. Definitions only.
  "20260826064238_ca543cd1-29d2-4872-81dd-96acfa83d6ca.sql",
  "20260826064431_3ebf58b0-f9af-4bf0-83f0-937336669d68.sql",
  "20260826064528_9d6949fd-c285-46b5-8ac3-ccb10c30d725.sql",
]);


/**
 * Migrations that may legitimately mention ron_invoke_worker at all. Anything else that
 * names the worker is a one-off invocation harness, not infrastructure.
 */
const WORKER_DEFINITION_FILES = new Set([
  "20260812072740_c3f6ce80-55cd-4304-9c71-5606fef3d117.sql",
  "20260813090242_525bbba0-acde-406d-8eb7-e5d27af09b0f.sql",
  // GAINEDGE_GDELT_SERVER_SCHEDULE_V1: cron.schedule definition for the internal raw
  // GDELT headline ingestion function. Schedule definition only; no side effect at replay
  // beyond (re)registering the named job.
  "20260817110900_ingest_macro_headlines_cron.sql",
]);

/** Test-harness / one-off invocation versions — permanently neutralized, never allowlistable. */
const NEUTRALIZED = [
  "20260812061529_b2715105-428c-4f08-b298-f65690659378.sql",
  "20260812061605_c1786ff3-16b0-4902-814d-b557f17f79bb.sql",
  "20260812061631_74b8ba37-7192-46a5-899b-ca6f8ca5fcd2.sql",
  "20260812061708_3949a756-b215-422c-bfd1-8fbc03996ea3.sql",
  // Phase 2D.1f-c one-off native-15m recovery invocations.
  "20260813035523_806f0f2a-8d0d-4687-9a97-8cfe8cd2bda2.sql",
  "20260813035557_cf9da5db-5cce-407f-aec4-4984c651f58b.sql",
  "20260813035902_ec0d16c3-c9b6-4879-93ba-15e731efb928.sql",
];

const read = (f: string) => fs.readFileSync(path.join(DIR, f), "utf8");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

describe("migration hygiene", () => {
  it("finds migration files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no non-allowlisted migration contains executable side-effect tokens", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (ALLOWLIST.has(f)) continue;
      const sql = read(f).toLowerCase();
      for (const token of FORBIDDEN) {
        if (sql.includes(token.toLowerCase())) offenders.push(`${f} -> ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("neutralized harness/one-off migrations stay inert", () => {
    for (const f of NEUTRALIZED) {
      const sql = read(f);
      const lower = sql.toLowerCase();
      for (const token of FORBIDDEN) expect(lower).not.toContain(token.toLowerCase());
      expect(lower).not.toMatch(/\bdo\s+\$\$/);
      expect(lower).not.toMatch(/\bperform\b/);
      expect(lower).not.toMatch(/\bcron\.schedule\b/);
      expect(lower).not.toMatch(/\binsert\s+into\b/);
    }
  });

  it("no migration keeps an executable session-structure specialist invocation", () => {
    // Narrow by design: earlier phases legitimately schedule other RON workers. What must
    // never persist as executable SQL is a one-off trigger for the agentic specialist
    // endpoint, which performs live analysis and can persist evidence.
    const offenders: string[] = [];
    for (const f of files) {
      const sql = read(f);
      // strip SQL line comments so historical markers stay legal
      const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").toLowerCase();
      if (!code.includes("ron-agent-session-structure")) continue;
      if (WORKER_DEFINITION_FILES.has(f)) continue; // allow-list entry inside the definition
      offenders.push(`${f} -> executable reference to the session-structure specialist`);
    }
    expect(offenders).toEqual([]);
  });

  it("no migration keeps an executable calibration-validation specialist invocation", () => {
    // Phase 2D.2c: the calibration/model-validation specialist is read-only, but a
    // replayable one-off invocation harness is still forbidden — production smokes are
    // triggered ephemerally, never from a migration.
    const offenders: string[] = [];
    for (const f of files) {
      const code = read(f).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").toLowerCase();
      if (code.includes("ron-agent-calibration-validation")) {
        offenders.push(`${f} -> executable reference to the calibration-validation specialist`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the Phase 2D.2b-CORR worker allow-list migration is definition-only and service-role scoped", () => {
    const sql = read("20260813090242_525bbba0-acde-406d-8eb7-e5d27af09b0f.sql");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.ron_invoke_worker");
    expect(sql).toContain("'ron-agent-session-structure'");
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.ron_invoke_worker\(text, jsonb\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.ron_invoke_worker\(text, jsonb\) TO service_role;/);
    expect(sql).not.toMatch(/\bdo\s+\$\$/i);
  });

  it("the Phase 2D.2b-CORR smoke migration is a comment-only historical marker", () => {
    const sql = read("20260813090313_5a98de55-5877-42b3-ba8b-d3d7f442a441.sql");
    const executable = sql.split("\n").map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("--"));
    expect(executable).toEqual([]);
    expect(sql.toLowerCase()).not.toContain("ron_invoke_worker(");
  });

  it("the legitimate Phase 2B.2 schema migration is unchanged", () => {
    const sql = read("20260812061200_48d73eac-b9cc-4ce9-9afb-d5b8a87a2b65.sql");
    expect(sql).toContain("ALTER TABLE public.ron_calibration_runs");
    expect(sql).toContain("canonical_source_min_bar_time");
    expect(sql).toContain("canonical_source_max_bar_time");
  });
});
