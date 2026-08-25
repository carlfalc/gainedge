import { useEffect, useState } from "react";
import TradingViewChartPage from "@/pages/dashboard/TradingViewChartPage";

/**
 * GAINEDGE session-scoped chart persistence (V1).
 *
 * The public cross-origin TradingView widget cannot serialize its native drawings or
 * indicators, so the only honest way to keep them is to never unmount the iframe.
 * The Charts tree is therefore hosted here, at the shared dashboard shell level, and
 * merely HIDDEN when another route is active.
 *
 * Truth boundary: this preserves chart state for the current browser session only.
 * A full refresh, browser close, new device or new login starts fresh.
 *
 * Mobile fallback: on small viewports keeping a live TradingView iframe resident while
 * hidden is not safe, so the tree is unmounted there (documented, desktop-first).
 */
export const CHARTS_ROUTE_PATH = "/dashboard/charts";
export const CHARTS_PERSISTENCE_NOTE =
  "Chart indicators and drawings are preserved while this GainEdge session stays open. Full saved layouts are planned for Advanced Charts.";

export function isSmallViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

/** Route element for /dashboard/charts — the real tree lives in the shell. */
export function ChartsRoutePlaceholder() {
  return <div data-testid="charts-route-placeholder" />;
}

export default function PersistentChartsHost({ visible }: { visible: boolean }) {
  const [everVisible, setEverVisible] = useState(visible);
  const [small, setSmall] = useState(isSmallViewport);

  useEffect(() => { if (visible) setEverVisible(true); }, [visible]);
  useEffect(() => {
    const onResize = () => setSmall(isSmallViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (small && !visible) return null;
  if (!everVisible) return null;

  return (
    <div
      data-testid="persistent-charts-host"
      style={{ display: visible ? "block" : "none", height: "100%" }}
    >
      <TradingViewChartPage chartsVisible={visible} />
    </div>
  );
}
