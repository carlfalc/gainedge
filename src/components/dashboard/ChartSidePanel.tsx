/**
 * GAINEDGE_CHARTS_UI_V1_1_REFINEMENT — instrument-specific right rail: RON | TRADE.
 *
 * Truthfulness: RON content comes only from the current production snapshot; positions
 * come only from the active chart pane's genuine MetaAPI list; the Pending orders
 * subsection never fabricates broker orders because pending-order retrieval is not
 * available yet. Numeric pattern confidence is never surfaced.
 */
import { useState } from "react";
import { TrendingUp, TrendingDown, Loader2, MessageSquare, Info } from "lucide-react";
import type { Position } from "@/components/dashboard/TradeExecutionPanel";
import type { RonSnapshotRow } from "@/services/ron-snapshots";
import { ronStateColor } from "@/services/ron-snapshots";
import {
  buildRonChartContext,
  filterPositionsForSymbol,
  ORDERS_NOT_SYNCED_MESSAGE,
  RON_CONTEXT_TIMEFRAME,
} from "@/lib/charts-context";
import { askRonContextHref, askRonContextTitle } from "@/lib/ask-ron-context";

type RailTab = "ron" | "trade";

interface Props {
  symbol: string;
  userId: string | undefined;
  accountId: string | null;
  positions: Position[];
  onClosePosition: (positionId: string) => void;
  closingId: string | null;
  snapshot?: RonSnapshotRow | null;
  tradingConnected?: boolean;
  /** Locally-entered limit/stop draft in the trade panel — never a live broker order. */
  orderDraftLabel?: string | null;
}

const TABS: { id: RailTab; label: string }[] = [
  { id: "ron", label: "RON" },
  { id: "trade", label: "TRADE" },
];

export default function ChartSidePanel({
  symbol, positions, onClosePosition, closingId,
  snapshot = null, tradingConnected = false, orderDraftLabel = null,
}: Props) {
  const [tab, setTab] = useState<RailTab>("ron");
  const priceDec = symbol.includes("JPY") ? 3 : ["XAUUSD", "US30", "NAS100", "SPX500"].some(s => symbol.includes(s)) ? 2 : 5;
  const filtered = filterPositionsForSymbol(positions, symbol);
  const ronCtx = buildRonChartContext(symbol, snapshot);
  const ron = ronCtx.available ? ronCtx : null;
  const ronUnavailableMessage = ronCtx.available ? null : ronCtx.message;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border overflow-hidden" data-testid="chart-side-rail">
      <div className="flex items-center gap-1 p-1.5 border-b border-border shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-1.5 rounded text-[12px] font-semibold tracking-wide transition-colors ${
              tab === t.id
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`rail-tab-${t.id}`}
          >
            {t.label}
            {t.id === "trade" && filtered.length > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">({filtered.length})</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "ron" && (
          <div className="p-4 space-y-4" data-testid="rail-ron">
            {!ron ? (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground" data-testid="ron-data-building">
                {ronUnavailableMessage}
              </p>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase"
                      style={{ background: `${ronStateColor(ron.state)}22`, color: ronStateColor(ron.state) }}
                    >
                      {ron.state}
                    </span>
                    <span className="text-[11px] text-muted-foreground">RON context {ron.timeframe}</span>
                  </div>
                  <p className="mt-2 text-[11.5px] text-muted-foreground" data-testid="ron-evaluated">
                    {ron.evaluatedLabel}
                  </p>
                  <p className="text-[11.5px] text-muted-foreground">{ron.dataHealthLabel}</p>
                </div>

                {ron.regime && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Market regime</div>
                    <div className="text-[13px] text-foreground">{ron.regime}</div>
                  </div>
                )}

                {ron.chips.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Current evidence</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ron.chips.map(c => (
                        <span key={c.label} className="px-2 py-1 rounded bg-background/60 border border-border text-[11.5px]">
                          <span className="text-muted-foreground">{c.label} </span>
                          <span className="font-mono text-foreground">{c.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div data-testid="ron-patterns">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Current patterns</div>
                  {ron.patternItems.length === 0 ? (
                    <div className="text-[12.5px] text-muted-foreground">No pattern on the current bar</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ron.patternItems.map(p => (
                        <span
                          key={p}
                          className="px-2 py-1 rounded bg-background/60 border border-border text-[12px] text-foreground"
                        >
                          {p}
                        </span>
                      ))}
                      {ron.patternsMore > 0 && (
                        <span className="px-2 py-1 rounded text-[12px] text-muted-foreground" data-testid="patterns-more">
                          +{ron.patternsMore} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">What would change this</div>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">{ron.next}</p>
                </div>
              </>
            )}

            <p className="text-[11.5px] text-muted-foreground border-t border-border pt-3" data-testid="opportunity-not-live">
              No qualified opportunity yet — the opportunity engine is not yet live in the UI.
            </p>

            <a
              href={askRonContextHref(symbol, RON_CONTEXT_TIMEFRAME)}
              title={askRonContextTitle(symbol, RON_CONTEXT_TIMEFRAME)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold border border-[#00CFA5]/40 text-[#00CFA5] hover:bg-[#00CFA5]/10 transition-colors"
              data-testid="ask-ron-link"
            >
              <MessageSquare size={13} /> Ask RON about {symbol}
            </a>

            <p className="text-[11px] text-muted-foreground/80 border-t border-border pt-3">
              Falconer v7 • Strategy context only. Controls live on the{" "}
              <a href="/dashboard/strategy" className="text-[#00CFA5] hover:underline">Strategy page</a>.
            </p>
          </div>
        )}

        {tab === "trade" && (
          <div className="p-4 space-y-4" data-testid="rail-trade">
            <section data-testid="rail-open-positions">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Open positions{filtered.length > 0 ? ` (${filtered.length})` : ""}
              </div>
              {!tradingConnected ? (
                <p className="text-[12.5px] text-muted-foreground">Connect a broker to view positions</p>
              ) : filtered.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">No open positions for {symbol}</p>
              ) : (
                <div className="space-y-2.5">
                  {filtered.map(pos => {
                    const isBuy = pos.type?.toLowerCase().includes("buy");
                    const pnlColor = pos.profit >= 0 ? "#22C55E" : "#EF4444";
                    return (
                      <div key={pos.id} className="p-3 rounded-lg bg-background/50 border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {isBuy ? <TrendingUp size={13} style={{ color: "#22C55E" }} /> : <TrendingDown size={13} style={{ color: "#EF4444" }} />}
                            <span className="text-[12.5px] font-bold" style={{ color: isBuy ? "#22C55E" : "#EF4444" }}>
                              {isBuy ? "BUY" : "SELL"} {pos.volume}
                            </span>
                          </div>
                          <button
                            onClick={() => onClosePosition(pos.id)}
                            disabled={closingId === pos.id}
                            className="px-2.5 py-1 rounded text-[10.5px] font-bold bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors disabled:opacity-50"
                          >
                            {closingId === pos.id ? <Loader2 size={11} className="animate-spin" /> : "CLOSE"}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                          <div>
                            <span className="text-muted-foreground block">Entry</span>
                            <div className="font-mono text-foreground">{pos.openPrice.toFixed(priceDec)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Current</span>
                            <div className="font-mono text-foreground">
                              {typeof pos.currentPrice === "number" ? pos.currentPrice.toFixed(priceDec) : "—"}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">SL</span>
                            <div className="font-mono text-foreground">{pos.stopLoss ? pos.stopLoss.toFixed(priceDec) : "—"}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">TP</span>
                            <div className="font-mono text-foreground">{pos.takeProfit ? pos.takeProfit.toFixed(priceDec) : "—"}</div>
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground block">Unrealised P&L</span>
                            <div className="font-mono font-bold" style={{ color: pnlColor }}>${pos.profit.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground/80">
                Manual trading uses live broker funds. Verify every order before you send it.
              </p>
            </section>

            <section className="border-t border-border pt-3 space-y-2" data-testid="rail-pending-orders">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pending orders</div>
              <div className="flex items-start gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-[12.5px] leading-relaxed text-muted-foreground" data-testid="orders-not-synced">
                  {ORDERS_NOT_SYNCED_MESSAGE}
                </p>
              </div>
              {orderDraftLabel && (
                <div className="p-2.5 rounded border border-border bg-background/50">
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Order draft (not sent)</div>
                  <div className="text-[12.5px] font-mono text-foreground">{orderDraftLabel}</div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground/80">
                Live pending-order retrieval, modify and cancel arrive with Charts Trading V2.
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
