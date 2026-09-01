/**
 * Compact, wrap-safe badge stating where a displayed price came from and how
 * fresh it is. Presentation only — it never fetches and never re-labels a
 * completed bar as a live quote.
 */
import { C } from "@/lib/mock-data";
import {
  presentPriceProvenance,
  type PriceProvenanceInput,
} from "@/lib/market-provenance-presentation";

const TONE: Record<string, string> = {
  fresh: C.jade,
  stale: "#F59E0B",
  unknown: "#F59E0B",
};

export default function PriceProvenanceBadge(
  props: PriceProvenanceInput & { showDetail?: boolean },
) {
  const { showDetail = false, ...input } = props;
  const p = presentPriceProvenance(input);
  const tone = p.kind === "completed_bar" ? C.blue : TONE[p.state];

  return (
    <span
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-tight break-words"
      style={{ background: `${tone}1A`, color: tone }}
      data-testid="price-provenance-badge"
      title={p.detail}
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: tone }}
        aria-hidden="true"
      />
      <span>{p.label}</span>
      {showDetail && (
        <span className="opacity-70" data-testid="price-provenance-detail">
          {p.detail}
        </span>
      )}
    </span>
  );
}
