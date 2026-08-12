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
]);

/** Phase 2B.2 test-harness versions — permanently neutralized, never allowlistable. */
const NEUTRALIZED = [
  "20260812061529_b2715105-428c-4f08-b298-f65690659378.sql",
  "20260812061605_c1786ff3-16b0-4902-814d-b557f17f79bb.sql",
  "20260812061631_74b8ba37-7192-46a5-899b-ca6f8ca5fcd2.sql",
  "20260812061708_3949a756-b215-422c-bfd1-8fbc03996ea3.sql",
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

  it("Phase 2B.2 test-harness migrations stay inert", () => {
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

  it("the legitimate Phase 2B.2 schema migration is unchanged", () => {
    const sql = read("20260812061200_48d73eac-b9cc-4ce9-9afb-d5b8a87a2b65.sql");
    expect(sql).toContain("ALTER TABLE public.ron_calibration_runs");
    expect(sql).toContain("canonical_source_min_bar_time");
    expect(sql).toContain("canonical_source_max_bar_time");
  });
});
