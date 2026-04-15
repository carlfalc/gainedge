import { useEffect, useRef } from "react";

export default function MoversShakersWidget() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const html = `<!DOCTYPE html>
<html><head><style>
body { margin:0; background:#0B1121; overflow:hidden; }
</style></head><body>
<script type="text/javascript">
DukascopyApplet = {
  type: "movers_and_shakers_propper",
  params: {
    showHeader: false,
    showVideoLink: false,
    tableBorderColor: "#1E293B",
    defaultPeriod: 0,
    entryCount: 10,
    width: "100%",
    height: "425",
    adv: "popup"
  }
};
<\/script>
<script type="text/javascript" src="https://freeserv-static.dukascopy.com/2.0/core.js"><\/script>
</body></html>`;

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{ width: "100%", height: 425, border: "none", display: "block" }}
        sandbox="allow-scripts allow-same-origin allow-popups"
        title="Movers & Shakers"
      />
    </div>
  );
}
