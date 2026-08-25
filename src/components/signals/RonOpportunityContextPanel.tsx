/**
 * GAINEDGE_RON_OPPORTUNITY_CONTEXT_UI_V1 — renders ONE stored RON opportunity-context
 * record. Every value shown is a stored categorical token restated in plain English.
 * Nothing here is scored, ranked, predicted or turned into an instruction.
 */
import { C } from "@/lib/mock-data";
import {
  OPPORTUNITY_CONTEXT_ANCHOR_NOTE, OPPORTUNITY_CONTEXT_QUALIFIER, opportunitySummary,
  opportunityTone, presentAuthority, presentContextState, presentDataState,
  presentDirection, presentLifecycle, presentMaterialChange, presentSetupFamily,
} from "@/lib/ron-opportunity-context-presentation";
import { formatLocalDateTime } from "@/lib/signals-presentation";
import type { RonOpportunityContextRecord } from "@/services/ron-opportunity-context";

const TONE_COLOR = {
  supported: C.jade, caution: C.amber, blocked: C.red, neutral: C.sec,
} as const;

function Row({ label, value, unknown }: { label: string; value: string; unknown?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px]" style={{ color: C.muted }}>{label}</span>
      <span className="text-right text-[11px]" style={{ color: unknown ? C.amber : C.text }}>
        {value}{unknown ? " (unrecognised stored value)" : ""}
      </span>
    </div>
  );
}

export default function RonOpportunityContextPanel(
  { record }: { record: RonOpportunityContextRecord },
) {
  const lifecycle = presentLifecycle(record.lifecycle);
  const tone = TONE_COLOR[opportunityTone(record.lifecycle, record.data_state)];
  const direction = presentDirection(record.direction_context);
  const authority = presentAuthority(record.direction_authority);
  const family = presentSetupFamily(record.setup_family);
  const dataState = presentDataState(record.data_state);
  const change = presentMaterialChange(record.material_change_type);

  return (
    <div
      className="mt-3 rounded-lg p-3"
      style={{ background: C.bg2, border: `1px solid ${C.border}` }}
      data-testid={`ron-opportunity-context-${record.instrument}-${record.timeframe}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] uppercase tracking-widest" style={{ color: C.muted }}>
          Opportunity context
        </span>
        <span
          className="rounded-md px-2 py-0.5 text-xs"
          style={{ background: `${tone}1A`, color: tone }}
          data-testid="ron-opportunity-context-lifecycle"
        >
          {lifecycle.label}
        </span>
        <span className="text-[11px]" style={{ color: C.sec }}>{change.label}</span>
      </div>

      <p className="mt-2 text-xs leading-relaxed" style={{ color: C.text }}>
        {opportunitySummary(record)}
      </p>

      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        <Row label="Direction" value={direction.label} unknown={direction.unknown} />
        <Row label="Authority" value={authority.label} unknown={authority.unknown} />
        <Row label="Setup family" value={family.label} unknown={family.unknown} />
        <Row label="Data state" value={dataState.label} unknown={dataState.unknown} />
        <Row label="Pattern context" value={presentContextState(record.pattern_context_state).label} />
        <Row label="Cross-asset context" value={presentContextState(record.cross_asset_context_state).label} />
        <Row label="Macro context" value={presentContextState(record.macro_context_state).label} />
        <Row label="Evaluated" value={formatLocalDateTime(record.evaluation_anchor)} />
      </div>

      {record.data_blocked && (
        <p className="mt-2 text-[11px]" style={{ color: C.amber }}>
          This is a data condition, not a market invalidation.
        </p>
      )}

      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: C.muted }}>
        {OPPORTUNITY_CONTEXT_QUALIFIER} {OPPORTUNITY_CONTEXT_ANCHOR_NOTE}
      </p>
    </div>
  );
}
