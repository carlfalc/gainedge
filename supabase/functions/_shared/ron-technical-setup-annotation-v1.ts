import {
  technicalSetupDefinition,
  type RonTechnicalSetupId,
} from "./ron-technical-setup-catalog-v1.ts";
import {
  validateRonChartAnnotationV1,
  type RonChartAnchorV1,
  type RonChartAnnotationDirection,
  type RonChartAnnotationLifecycle,
  type RonChartAnnotationV1,
  type RonChartGeometryV1,
  type RonChartAnnotationKind,
} from "./ron-chart-annotation-v1.ts";

/**
 * GAINEDGE_RON_TECHNICAL_SETUP_ANNOTATION_V1
 *
 * Converts an already-detected, evidence-backed technical setup into the canonical chart
 * annotation contract. This module does NOT detect setups and does NOT infer missing
 * geometry. Detectors must supply exact completed-bar anchors/prices first.
 */

export interface TechnicalSetupAnnotationInputV1 {
  id: string;
  symbol: string;
  timeframe: string;
  setup_id: RonTechnicalSetupId;
  /** Must agree with the frozen setup definition unless the definition is contextual. */
  direction: RonChartAnnotationDirection;
  lifecycle: RonChartAnnotationLifecycle;
  source_agent: string;
  as_of_bar_time: string;
  origin_anchor: RonChartAnchorV1;
  last_test_anchor?: RonChartAnchorV1 | null;
  retest_count?: number | null;
  geometry: RonChartGeometryV1;
  evidence_refs?: string[];
  provenance?: Record<string, string | number | boolean | null>;
}

const EXPECTED_KIND_BY_FAMILY: Record<string, RonChartAnnotationKind> = {
  supply_demand: "zone",
  support_resistance: "level",
  pivot: "pivot",
  fibonacci: "fib",
  ema: "ema_event",
};

export type TechnicalSetupAnnotationBuildResultV1 =
  | { ok: true; annotation: RonChartAnnotationV1 }
  | { ok: false; reason: string };

export function buildTechnicalSetupChartAnnotationV1(
  input: TechnicalSetupAnnotationInputV1,
): TechnicalSetupAnnotationBuildResultV1 {
  const definition = technicalSetupDefinition(input.setup_id);
  const expectedKind = EXPECTED_KIND_BY_FAMILY[definition.family];
  if (!expectedKind) return { ok: false, reason: `unsupported_setup_family:${definition.family}` };
  if (input.geometry.type !== expectedKind) {
    return { ok: false, reason: `setup_geometry_mismatch:${definition.family}:${input.geometry.type}` };
  }
  if (definition.direction !== "contextual" && input.direction !== definition.direction) {
    return { ok: false, reason: `setup_direction_mismatch:${definition.direction}:${input.direction}` };
  }

  const annotation: RonChartAnnotationV1 = {
    annotation_version: 1,
    id: input.id,
    symbol: input.symbol,
    timeframe: input.timeframe,
    kind: expectedKind,
    subtype: input.setup_id,
    direction: input.direction,
    lifecycle: input.lifecycle,
    source_agent: input.source_agent,
    source_setup_id: input.setup_id,
    as_of_bar_time: input.as_of_bar_time,
    origin_anchor: input.origin_anchor,
    last_test_anchor: input.last_test_anchor ?? null,
    retest_count: input.retest_count ?? null,
    geometry: input.geometry,
    evidence_refs: input.evidence_refs ?? [],
    provenance: {
      technical_setup_catalog_version: 1,
      completed_bars_only: true,
      ...(input.provenance ?? {}),
    },
  };

  const valid = validateRonChartAnnotationV1(annotation);
  if (!valid.ok) return { ok: false, reason: `annotation_invalid:${valid.reason}` };
  return { ok: true, annotation };
}
