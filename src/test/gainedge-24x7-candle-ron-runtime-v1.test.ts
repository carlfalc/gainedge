/**
 * GAINEDGE_24X7_CANDLE_RON_RUNTIME_V1 — scheduler contract tests.
 *
 * Proves the always-on RON scheduler is XAUUSD/15m only, completed-bar gated,
 * exactly-once per anchor, fail-closed on missing/stale/quarantined source, service-role
 * only, browser-independent, execution-free and research-free — and that it changes no
 * frozen orchestrator artifact.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_ANCHOR_AGE_MS, RUNTIME_BAR_MS, RUNTIME_INSTRUMENT, RUNTIME_TIMEFRAME, selectAnchor,
} from "../../supabase/functions/ron-schedule-orchestration/anchor-gate.ts";

const FN_DIR = "supabase/functions/ron-schedule-orchestration";
const indexSrc = readFileSync(join(FN_DIR, "index.ts"), "utf8");
const gateSrc = readFileSync(join(FN_DIR, "anchor-gate.ts"), "utf8");

const MIGRATIONS_DIR = "supabase/migrations";
const migrationFile = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .find((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8").includes("ron-orchestrate-15m"));
const migrationSrc = migrationFile
  ? readFileSync(join(MIGRATIONS_DIR, migrationFile), "utf8")
  : "";

const BAR = RUNTIME_BAR_MS;
const anchorMs = Date.parse("2026-08-21T05:45:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function base(overrides: Partial<Parameters<typeof selectAnchor>[0]> = {}) {
  return selectAnchor({
    now_ms: anchorMs + BAR + 30_000,
    snapshot_bar_times: [iso(anchorMs), iso(anchorMs - BAR)],
    candle_bar_times: [iso(anchorMs), iso(anchorMs - BAR)],
    decision_anchors: [],
    quarantined_bar_times: [],
    ...overrides,
  });
}

describe("anchor gate — scope and completed-bar semantics", () => {
  it("is pinned to XAUUSD 15m only", () => {
    expect(RUNTIME_INSTRUMENT).toBe("XAUUSD");
    expect(RUNTIME_TIMEFRAME).toBe("15m");
    expect(RUNTIME_BAR_MS).toBe(900_000);
  });

  it("selects the latest completed bar", () => {
    const r = base();
    expect(r.run).toBe(true);
    expect(r.anchor).toBe(iso(anchorMs + BAR));
    expect(r.bar_time).toBe(iso(anchorMs));
  });

  it("never selects a bar whose interval has not fully closed", () => {
    const r = base({ now_ms: anchorMs + BAR - 1, snapshot_bar_times: [iso(anchorMs)] });
    expect(r.run).toBe(false);
    expect(r.reason).toBe("no_completed_bar");
  });


  it("rejects bar times not aligned to the 15m grid", () => {
    const r = base({ snapshot_bar_times: [iso(anchorMs + 60_000)] });
    expect(r.run).toBe(false);
    expect(r.reason).toBe("no_completed_bar");
  });
});

describe("anchor gate — fail-closed source rules", () => {
  it("fails closed with no snapshot source", () => {
    expect(base({ snapshot_bar_times: [] })).toMatchObject({ run: false, reason: "no_snapshot_source" });
  });

  it("fails closed when the genuine candle row is missing", () => {
    expect(base({ candle_bar_times: [] })).toMatchObject({ run: false, reason: "missing_genuine_candle" });
  });

  it("fails closed on a quarantined bar", () => {
    expect(base({ quarantined_bar_times: [iso(anchorMs)] })).toMatchObject({ run: false, reason: "quarantined_bar" });
  });

  it("fails closed on stale source beyond the age ceiling", () => {
    expect(base({ now_ms: anchorMs + MAX_ANCHOR_AGE_MS + BAR }))
      .toMatchObject({ run: false, reason: "stale_source" });
  });

  it("never invents an anchor when it declines", () => {
    for (const r of [base({ snapshot_bar_times: [] }), base({ candle_bar_times: [] })]) {
      expect(r.anchor).toBeNull();
    }
  });
});

describe("anchor gate — exact-anchor idempotency", () => {
  it("no-ops when a decision already exists for that exact anchor", () => {
    expect(base({ decision_anchors: [iso(anchorMs + BAR)] }))
      .toMatchObject({ run: false, reason: "already_decided" });
  });

  it("a decision on a different anchor does not block a new one", () => {
    expect(base({ decision_anchors: [iso(anchorMs)] })).toMatchObject({ run: true });
  });

  it("treats equivalent ISO spellings of the same instant as decided", () => {
    expect(base({ decision_anchors: ["2026-08-21 06:00:00+00"] }))
      .toMatchObject({ run: false, reason: "already_decided" });
  });
});

describe("scheduler endpoint safety", () => {
  it("is service-role only and returns 401 otherwise", () => {
    expect(indexSrc).toContain("timingSafeEq(token, serviceKey)");
    expect(indexSrc).toContain("unauthorized: internal service-role endpoint");
  });

  it("pins the frozen seven-agent orchestration run version", () => {
    expect(indexSrc).toContain("const ORCHESTRATION_RUN_VERSION = 7");
    expect(indexSrc).toContain("ron-orchestrate-run");
  });

  it("declares no execution surface and no probability", () => {
    expect(indexSrc).toContain('execution_path: "signal_only"');
    expect(indexSrc).toContain("execution_allowed: false");
    expect(indexSrc).toContain("numeric_probability: null");
  });

  it("imports and calls no execution, research or calibration surface", () => {
    const banned = [
      "metaapi-trade", "metaapi_trade", "falconer-backtest", "ron-research",
      "ron-calibrate", "ron-robustness", "place_order", "createOrder",
    ];
    for (const b of banned) expect(indexSrc.includes(b)).toBe(false);
  });

  it("has no browser/session dependency", () => {
    for (const b of ["window", "localStorage", "document.", "@/integrations"]) {
      expect(indexSrc.includes(b)).toBe(false);
    }
  });

  it("writes only through the existing orchestration persistence path", () => {
    expect(indexSrc.includes(".upsert(")).toBe(false);
    expect(indexSrc.includes(".insert(")).toBe(false);
    expect(indexSrc).toContain("persist: true");
  });

  it("keeps the anchor gate pure (no network or database access)", () => {
    for (const b of ["fetch(", "createClient", "Deno.env"]) {
      expect(gateSrc.includes(b)).toBe(false);
    }
  });
});

describe("server-side schedule", () => {
  it("exists as a migration", () => {
    expect(migrationFile).toBeTruthy();
  });

  it("is a pg_cron job invoking the scheduler function only", () => {
    expect(migrationSrc).toContain("cron.schedule(");
    expect(migrationSrc).toContain("ron-orchestrate-15m");
    expect(migrationSrc).toContain("ron-schedule-orchestration");
    expect(migrationSrc).toContain("net.http_post");
  });

  it("is idempotent and reads its key from Vault", () => {
    expect(migrationSrc).toContain("cron.unschedule('ron-orchestrate-15m')");
    expect(migrationSrc).toContain("vault.decrypted_secrets");
  });

  it("embeds no literal service-role key", () => {
    expect(/eyJ[A-Za-z0-9_-]{20,}/.test(migrationSrc)).toBe(false);
  });

  it("does not create or alter any data table", () => {
    for (const b of ["create table", "drop table", "alter table", "delete from", "update public."]) {
      expect(migrationSrc.toLowerCase().includes(b)).toBe(false);
    }
  });
});
