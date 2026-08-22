import { it } from "vitest";
import { sessionStructureSpecHashV3 } from "../../supabase/functions/_shared/ron-session-structure-spec-v3.ts";
import { patternContextSpecHashV3, SESSION_STRUCTURE_SPEC_V3_HASH_PINNED, PATTERN_CONTEXT_SPEC_V2_HASH_PINNED } from "../../supabase/functions/_shared/ron-pattern-structure-context-v3.ts";
import { crossAssetRelationshipSpecHashV3 } from "../../supabase/functions/_shared/ron-cross-asset-relationship-context-v3.ts";
import { opportunityRiskSpecHashV3, ACCEPTED_SESSION_STRUCTURE_V3_HASH, ACCEPTED_PATTERN_V3_HASH, ACCEPTED_CROSS_ASSET_V3_HASH } from "../../supabase/functions/_shared/ron-opportunity-risk-spec-v3.ts";
it("hashes", async () => {
  const s = await sessionStructureSpecHashV3();
  const p = await patternContextSpecHashV3();
  const c = await crossAssetRelationshipSpecHashV3();
  const o = await opportunityRiskSpecHashV3();
  console.log(JSON.stringify({ session: s, pattern: p, cross: c, opp: o,
    pin_session_in_pattern: SESSION_STRUCTURE_SPEC_V3_HASH_PINNED,
    pin_session_in_opp: ACCEPTED_SESSION_STRUCTURE_V3_HASH,
    pin_pattern_in_opp: ACCEPTED_PATTERN_V3_HASH,
    pin_cross_in_opp: ACCEPTED_CROSS_ASSET_V3_HASH }, null, 1));
});
