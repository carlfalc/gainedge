export default function LiveQuotesTicker() {
  const html = `<!DOCTYPE html>
<html><head><style>
body { margin:0; padding:0; background:#0B1121; overflow:hidden; }
</style></head><body>
<script type="text/javascript">
DukascopyApplet = {
  type: "runboard",
  params: {
    instruments: "EUR/USD,USD/JPY,GBP/USD,EUR/JPY,GBP/JPY,USD/CAD,XAU/USD,AUD/USD,USD/CHF,NZD/USD,E_Brent,E_SandP-500,E_DJE50XX,E_N225Jap",
    showDelta: true,
    showDeltaPercent: true,
    animationSpeed: ["100000"],
    fontSize: "12",
    fontFamily: ["Verdana, Geneva, sans-serif"],
    instrumentColor: "#94A3B8",
    priceColor: "#E2E8F0",
    delimeterColor: "#00CFA5",
    bgColor: "#0B1121",
    width: "100%",
    height: "30",
    adv: "popup"
  }
};
<\/script>
<script type="text/javascript" src="https://freeserv-static.dukascopy.com/2.0/core.js"><\/script>
</body></html>`;

  return (
    <iframe
      srcDoc={html}
      style={{
        width: "100%",
        height: 30,
        border: "none",
        display: "block",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
      sandbox="allow-scripts allow-same-origin allow-popups"
      title="Live Quotes"
    />
  );
}
