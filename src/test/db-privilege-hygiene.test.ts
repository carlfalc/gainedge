/**
 * Repository guard (Phase 2D.1c-a): the SECURITY DEFINER candle writer
 * public.bulk_insert_candles(jsonb) and the service-only recovery job table
 * must never be re-granted to PUBLIC/anon/authenticated by a future migration.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(__dirname, "../../supabase/migrations");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

const LOCKED_TARGETS = ["bulk_insert_candles", "ron_data_recovery_jobs"];
const FORBIDDEN_GRANTEES = ["public", "anon", "authenticated"];

/** GRANT ... ON <thing> TO <role list> — captures the grantee list. */
const GRANT_RE = /grant\s+[\s\S]*?\bon\b[\s\S]*?\bto\s+([a-z_,\s"]+)/gi;

describe("db privilege hygiene", () => {
  it("no migration grants locked-down objects to public/anon/authenticated", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const sql = fs.readFileSync(path.join(DIR, f), "utf8");
      for (const stmt of sql.split(";")) {
        const lower = stmt.toLowerCase();
        if (!lower.includes("grant")) continue;
        if (!LOCKED_TARGETS.some((t) => lower.includes(t))) continue;
        GRANT_RE.lastIndex = 0;
        const m = GRANT_RE.exec(lower);
        if (!m) continue;
        const grantees = m[1].split(",").map((s) => s.trim().replace(/"/g, ""));
        for (const g of grantees) {
          if (FORBIDDEN_GRANTEES.includes(g)) offenders.push(`${f} -> grants to ${g}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
