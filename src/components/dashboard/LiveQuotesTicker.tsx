export default function LiveQuotesTicker() {
  const html = `<!DOCTYPE html>
<html><head><style>
body { margin:0; padding:0; background:#0B1121; overflow:hidden; }
/* Override any black text in any nested element */
* { color: inherit; }
iframe { width:100%; height:30px; border:none; }
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
<script>
// Dukascopy creates a nested iframe - we need to reach into it
function fixNestedIframe() {
  try {
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
      if (!iframeDoc) continue;
      
      // Inject style into the nested iframe
      if (!iframeDoc.querySelector('#gainedge-fix')) {
        var style = iframeDoc.createElement('style');
        style.id = 'gainedge-fix';
        style.textContent = [
          'span[style*="color: rgb(0, 0, 0)"] { color: #94A3B8 !important; }',
          'span[style*="color:#000000"] { color: #94A3B8 !important; }',
          'span[style*="color:#000"] { color: #94A3B8 !important; }',
          'font[color="#000000"] { color: #94A3B8 !important; }',
          'font[color="black"] { color: #94A3B8 !important; }',
          '.negative span, .down span { color: #EF4444 !important; }',
          '.positive span, .up span { color: #22C55E !important; }',
        ].join('\\n');
        iframeDoc.head.appendChild(style);
      }

      // Also directly fix any black-colored elements
      var els = iframeDoc.querySelectorAll('*');
      for (var j = 0; j < els.length; j++) {
        var computed = iframeDoc.defaultView.getComputedStyle(els[j]);
        if (computed.color === 'rgb(0, 0, 0)') {
          var txt = (els[j].textContent || '').trim();
          if (txt.indexOf('-') === 0) {
            els[j].style.setProperty('color', '#EF4444', 'important');
          } else if (txt.match(/^\\+/) || txt.match(/^[0-9]/)) {
            els[j].style.setProperty('color', '#22C55E', 'important');
          } else {
            els[j].style.setProperty('color', '#94A3B8', 'important');
          }
        }
      }

      // Recurse into deeper iframes
      var deepIframes = iframeDoc.querySelectorAll('iframe');
      for (var k = 0; k < deepIframes.length; k++) {
        try {
          var deepDoc = deepIframes[k].contentDocument || deepIframes[k].contentWindow.document;
          if (!deepDoc) continue;
          if (!deepDoc.querySelector('#gainedge-fix')) {
            var deepStyle = deepDoc.createElement('style');
            deepStyle.id = 'gainedge-fix';
            deepStyle.textContent = [
              'span[style*="color: rgb(0, 0, 0)"] { color: #94A3B8 !important; }',
              'span[style*="color:#000000"] { color: #94A3B8 !important; }',
              'font[color="#000000"] { color: #94A3B8 !important; }',
            ].join('\\n');
            deepDoc.head.appendChild(deepStyle);
          }
          var deepEls = deepDoc.querySelectorAll('*');
          for (var m = 0; m < deepEls.length; m++) {
            var dc = deepDoc.defaultView.getComputedStyle(deepEls[m]);
            if (dc.color === 'rgb(0, 0, 0)') {
              var dtxt = (deepEls[m].textContent || '').trim();
              if (dtxt.indexOf('-') === 0) {
                deepEls[m].style.setProperty('color', '#EF4444', 'important');
              } else if (dtxt.match(/^\\+/) || dtxt.match(/^[0-9]/)) {
                deepEls[m].style.setProperty('color', '#22C55E', 'important');
              } else {
                deepEls[m].style.setProperty('color', '#94A3B8', 'important');
              }
            }
          }
        } catch(e) {}
      }
    }
  } catch(e) {}
}

setInterval(fixNestedIframe, 300);
setTimeout(fixNestedIframe, 1500);
setTimeout(fixNestedIframe, 3000);
setTimeout(fixNestedIframe, 5000);
<\/script>
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
