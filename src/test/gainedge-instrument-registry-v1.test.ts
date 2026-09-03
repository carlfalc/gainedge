/**
 * GAINEDGE_INSTRUMENT_REGISTRY_V1 contract tests.
 *
 * Guards, in order of importance:
 *   1. The registry never becomes a back door into RON's sealed instrument scope.
 *   2. The frontend registry and its mirrored edge copy stay byte-equivalent in content.
 *   3. Strategy Lab V2 markets derive from the registry, not a hand-maintained list.
 *   4. Broker symbol coverage gaps are declared, never silently ignored.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  BACKTESTABLE_SYMBOLS, INSTRUMENT_REGISTRY, INSTRUMENT_SYMBOLS, RON_WATCH_SYMBOLS,
  SUPPORTED_BROKERS, backtestCoverageNote, getInstrument, isBacktestable,
} from "@/lib/instrument-registry";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

/**
 * Observed in production on the day this registry landed, by querying
 * `broker_symbol_mappings`. These rows were NOT inserted — the gap is declared so a
 * future mapping backfill flips this ledger to empty and the test proves it.
 */
const KNOWN_BROKER_MAPPING_GAPS: Record<string, readonly string[]> = {
  HK50: SUPPORTED_BROKERS,
  GER40: SUPPORTED_BROKERS,
};

describe("instrument registry — RON scope isolation", () => {
  it("ron_watch mirrors the sealed watch universe exactly", () => {
    const sealed = read("supabase/functions/_shared/ron-agentic-watch-universe-v1.ts");
    const block = sealed.split("RON_SELECTED_WATCH_INSTRUMENTS")[1].split("]")[0];
    const sealedSymbols = [...block.matchAll(/"([A-Z0-9]+)"/g)].map((m) => m[1]);
    expect(sealedSymbols.length).toBeGreaterThan(0);
    expect([...RON_WATCH_SYMBOLS].sort()).toEqual([...sealedSymbols].sort());
  });

  it("the sealed scope module does not import the registry", () => {
    for (const f of [
      "supabase/functions/_shared/ron-multi-market-scope-v1.ts",
      "supabase/functions/_shared/ron-agentic-watch-universe-v1.ts",
      "supabase/functions/_shared/ron-forward-instrument-binding-v1.ts",
    ]) {
      expect(read(f)).not.toMatch(/instrument-registry/);
    }
  });
});

describe("instrument registry — mirror parity", () => {
  it("the edge mirror declares the same symbols and backtest timeframes", () => {
    const mirror = read("supabase/functions/_shared/instrument-registry.ts");
    for (const item of INSTRUMENT_REGISTRY) {
      expect(mirror).toContain(`symbol: "${item.symbol}"`);
      expect(mirror).toContain(`backtest_timeframes: [${item.backtest_timeframes.map((t) => `"${t}"`).join(", ")}]`);
    }
    const mirrorSymbols = [...mirror.matchAll(/symbol: "([A-Z0-9]+)"/g)].map((m) => m[1]);
    expect(mirrorSymbols.sort()).toEqual([...INSTRUMENT_SYMBOLS].sort());
  });
});

describe("instrument registry — Strategy Lab V2 derivation", () => {
  it("contracts derive markets from BACKTESTABLE_SYMBOLS", () => {
    const contracts = read("supabase/functions/_shared/strategy-lab-v2-contracts.ts");
    expect(contracts).toMatch(/import \{[^}]*BACKTESTABLE_SYMBOLS[^}]*\} from "\.\/instrument-registry\.ts"/);
    expect(contracts).toContain("export const STRATEGY_LAB_V2_MARKETS = BACKTESTABLE_SYMBOLS");
    expect(contracts).not.toMatch(/STRATEGY_LAB_V2_MARKETS\s*=\s*\[/);
  });

  it("NZDUSD and USDCAD are selectable at 15m; no fake timeframe is offered", () => {
    expect(BACKTESTABLE_SYMBOLS).toContain("NZDUSD");
    expect(BACKTESTABLE_SYMBOLS).toContain("USDCAD");
    expect(isBacktestable("NZDUSD", "15m")).toBe(true);
    expect(isBacktestable("USDCAD", "15m")).toBe(true);
    expect(isBacktestable("NZDUSD", "1h")).toBe(false);
    expect(isBacktestable("USOUSD", "15m")).toBe(false);
  });

  it("the coverage note refuses to promise a run it cannot support", () => {
    expect(backtestCoverageNote("USDCAD", "4h")).toMatch(/refused as INCONCLUSIVE/);
    expect(backtestCoverageNote("XAUUSD", "1m")).toMatch(/data audit still has the final say/);
  });

  it("the Lab UI reads the registry and disables unsupported pairs", () => {
    const page = read("src/pages/dashboard/StrategyLabV2Page.tsx");
    expect(page).toContain("BACKTESTABLE_SYMBOLS.map");
    expect(page).toContain("backtestCoverageNote");
    expect(page).toMatch(/disabled=\{working \|\| !coverageKnown\}/);
    expect(page).not.toMatch(/\["XAUUSD", "NAS100", "HK50", "GER40"\]/);
  });
});

describe("instrument registry — broker symbol coverage", () => {
  it("declares every gap between the registry and broker_symbol_mappings", () => {
    // Production observation: all five brokers map XAUUSD/NAS100/NZDUSD/USDCAD.
    // HK50 and GER40 have no rows at all. Failing loudly here beats a silent insert.
    const gapped = Object.keys(KNOWN_BROKER_MAPPING_GAPS).sort();
    expect(gapped).toEqual(["GER40", "HK50"]);
    for (const symbol of gapped) {
      expect(getInstrument(symbol)).not.toBeNull();
      expect(KNOWN_BROKER_MAPPING_GAPS[symbol]).toEqual(SUPPORTED_BROKERS);
    }
    const covered = RON_WATCH_SYMBOLS.filter((s) => !gapped.includes(s));
    expect(covered.sort()).toEqual(["NAS100", "NZDUSD", "USDCAD", "XAUUSD"]);
  });
});

describe("page cleanup", () => {
  it("Strategy Lab V1 UI is gone, Falconer backtest UI is preserved, Falconer settings untouched", () => {
    expect(fs.existsSync(path.join(root, "src/pages/dashboard/StrategyLabPage.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(root, "src/pages/dashboard/StrategyPage.tsx"))).toBe(true);
    const panel = read("src/components/backtesting/FalconerBacktestPanel.tsx");
    expect(panel).toContain("falconer_backtest_runs");
    expect(panel).toContain("falconer-backtest");
    const page = read("src/pages/dashboard/BacktestingPage.tsx");
    expect(page).toContain("FalconerBacktestPanel");
    expect(page).toContain("StrategyLabV2Page");
    expect(page).not.toContain("StrategyLabPage");
  });

  it("no source file still imports the deleted V1 page", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name) && /from ["'].*StrategyLabPage["']/.test(fs.readFileSync(full, "utf8"))) hits.push(full);
      }
    };
    walk(path.join(root, "src"));
    expect(hits).toEqual([]);
  });
});

describe("landing sample tiles", () => {
  it("only shows registry instruments", () => {
    const index = read("src/pages/Index.tsx");
    const rows = index.split("function PremiumDash()")[1].split("];")[0];
    for (const symbol of [...rows.matchAll(/\{ s: "([A-Z0-9]+)"/g)].map((m) => m[1])) {
      expect(INSTRUMENT_SYMBOLS).toContain(symbol);
    }
    expect(rows).not.toContain("US30");
    expect(rows).not.toContain("AUDUSD");
  });
});
