import { describe, it, expect } from "vitest";
import {
  CALIBRATION_CONTRACTS, CALIBRATION_CONTRACT_CURRENT, CALIBRATION_CONTRACT_V6,
  CALIBRATION_CONTRACT_V7, CALIBRATION_CONTRACT_V8,
} from "../../supabase/functions/_shared/ron-calibration";
import {
  RON_QUALITY_VERSION, RON_QUALITY_VERSION_V3, RON_QUALITY_VERSION_V4,
} from "../../supabase/functions/_shared/ron-data-quality";
import {
  RON_FEATURE_VERSION, RON_FEATURE_VERSION_V4, RON_FEATURE_VERSION_V5,
} from "../../supabase/functions/_shared/ron-features";

describe("Phase 2D.1e — recovered-source lineage versions", () => {
  it("keeps the frozen 2D.1e lineage byte-identical", () => {
    expect(RON_QUALITY_VERSION_V4).toBe(4);
    expect(RON_FEATURE_VERSION_V5).toBe(5);
    expect(CALIBRATION_CONTRACT_V7).toEqual({
      calibration_version: 7, feature_version: 5, label_version: 6,
    });
  });

  it("keeps the frozen v6 lineage byte-identical", () => {
    expect(RON_QUALITY_VERSION_V3).toBe(3);
    expect(RON_FEATURE_VERSION_V4).toBe(4);
    expect(CALIBRATION_CONTRACT_V6).toEqual({
      calibration_version: 6, feature_version: 4, label_version: 5,
    });
  });

  it("registers every contract under its own key and points current at v8", () => {
    for (const [k, c] of Object.entries(CALIBRATION_CONTRACTS)) {
      expect(c.calibration_version).toBe(Number(k));
    }
    expect(CALIBRATION_CONTRACT_CURRENT).toBe(CALIBRATION_CONTRACT_V8);
  });

  it("retires the ambiguous bare CALIBRATION_VERSION export", async () => {
    const mod = await import("../../supabase/functions/_shared/ron-calibration");
    expect("CALIBRATION_VERSION" in mod).toBe(false);
  });
});

describe("Phase 2D.1g — native-15m-recovered lineage versions", () => {
  it("bumps every downstream artifact version exactly once", () => {
    expect(RON_QUALITY_VERSION).toBe(5);
    expect(RON_FEATURE_VERSION).toBe(6);
    expect(CALIBRATION_CONTRACT_V8).toEqual({
      calibration_version: 8, feature_version: 6, label_version: 7,
    });
  });
});
