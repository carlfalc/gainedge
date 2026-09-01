/**
 * GAINEDGE_SIGNALS_V1 — client-side filter controls for Falconer record lists.
 * Options are derived from the loaded records only; nothing is hard-coded.
 */
import { C } from "@/lib/mock-data";

export interface FalconerFilterValue {
  search: string;
  symbol: string;
  status: string;
  trigger: string;
}

export const EMPTY_FILTER: FalconerFilterValue = { search: "", symbol: "", status: "", trigger: "" };

const selectStyle = {
  background: C.cardH, border: `1px solid ${C.border}`, color: C.text,
} as const;

export default function FalconerFilters({
  value, onChange, symbols, statuses, triggers, statusLabel,
}: {
  value: FalconerFilterValue;
  onChange: (next: FalconerFilterValue) => void;
  symbols: string[];
  statuses: string[];
  triggers: string[];
  statusLabel: (token: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="falconer-filters">
      <input
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder="Search symbol or token"
        aria-label="Search records"
        className="rounded-lg px-3 py-1.5 text-sm"
        style={selectStyle}
      />
      <select
        aria-label="Filter by symbol"
        value={value.symbol}
        onChange={(e) => onChange({ ...value, symbol: e.target.value })}
        className="rounded-lg px-2.5 py-1.5 text-sm"
        style={selectStyle}
      >
        <option value="">All symbols</option>
        {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select
        aria-label="Filter by status"
        value={value.status}
        onChange={(e) => onChange({ ...value, status: e.target.value })}
        className="rounded-lg px-2.5 py-1.5 text-sm"
        style={selectStyle}
      >
        <option value="">All statuses</option>
        {statuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
      </select>
      <select
        aria-label="Filter by trigger"
        value={value.trigger}
        onChange={(e) => onChange({ ...value, trigger: e.target.value })}
        className="rounded-lg px-2.5 py-1.5 text-sm"
        style={selectStyle}
      >
        <option value="">All triggers</option>
        {triggers.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
