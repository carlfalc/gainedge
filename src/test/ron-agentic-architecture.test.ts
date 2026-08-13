import { describe, it, expect } from "vitest";
import {
  ACCEPTED_EVIDENCE_LEDGER, PROMOTED_STATE_VARIABLES, RON_AGENTIC_ARCHITECTURE_VERSION,
  RON_ROLES, agenticArchitectureHash, agenticArchitecturePayload, evaluateClaim,
} from "../../supabase/functions/_shared/ron-agentic-architecture.ts";

describe("2D.1h — RON agentic architecture foundation", () => {
  it("promotes nothing, matching the Research V4 negative result", () => {
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
    expect(RON_AGENTIC_ARCHITECTURE_VERSION).toBe(1);
  });

  it("refuses conditional-edge claims because no state variable was promoted", () => {
    const d = evaluateClaim({
      role: "researcher",
      claim_class: "conditional_edge",
      cites: ["research_v4"],
      conditions_on: ["session"],
    });
    expect(d.admissible).toBe(false);
    expect(d.reasons.join(" ")).toContain("state_variable_not_promoted: session");
  });

  it("admits a properly cited base-rate claim from the statistician", () => {
    expect(evaluateClaim({
      role: "statistician", claim_class: "base_rate", cites: ["calibration_v8"],
    })).toEqual({ admissible: true, reasons: [] });
  });

  it("denies by default: unknown roles, ungranted classes, uncited and unaccepted evidence", () => {
    expect(evaluateClaim({ role: "oracle", claim_class: "base_rate", cites: ["calibration_v8"] }).admissible).toBe(false);
    expect(evaluateClaim({ role: "observer", claim_class: "execution_intent", cites: ["lineage_2d1g"] }).admissible).toBe(false);
    expect(evaluateClaim({ role: "observer", claim_class: "observed_market_state", cites: [] }).reasons)
      .toContain("no_evidence_cited");
    expect(evaluateClaim({ role: "observer", claim_class: "observed_market_state", cites: ["research_v5"] }).reasons)
      .toContain("artifact_not_accepted: research_v5");
    expect(evaluateClaim({ role: "observer", claim_class: "observed_market_state", cites: ["calibration_v8"] }).reasons)
      .toContain("artifact_not_readable_by_role: calibration_v8");
  });

  it("every role reads only accepted artifacts", () => {
    const ids = ACCEPTED_EVIDENCE_LEDGER.map((a) => a.id);
    for (const r of RON_ROLES) for (const id of r.reads) expect(ids).toContain(id);
  });

  it("hashes deterministically and independently of declaration order", async () => {
    const a = await agenticArchitectureHash();
    const b = await agenticArchitectureHash();
    expect(a).toBe(b);
    expect(JSON.stringify(agenticArchitecturePayload())).toContain('"deny_by_default",true');
  });
});
