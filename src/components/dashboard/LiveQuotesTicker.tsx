export default function LiveQuotesTicker() {
  const html = `<!DOCTYPE html>
<html><head><style>
body { margin:0; padding:0; background:#0B1121; overflow:hidden; }

/* Force all delta/change text to inherit color from parent state */
/* Dukascopy uses classes or inline styles for up/down — override everything */
span[style*="color: rgb(0, 0, 0)"],
span[style*="color:#000000"],
span[style*="color:#000"],
span[style*="color:black"],
font[color="#000000"],
font[color="black"] {
  color: #94A3B8 !important;
}

/* MutationObserver will handle dynamic coloring */
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
// Poll and fix black text colors based on nearby arrow direction
function fixColors() {
  // Find all spans/elements with black text and recolor based on context
  var allEls = document.querySelectorAll('span, font, td, div');
  for (var i = 0; i < allEls.length; i++) {
    var el = allEls[i];
    var style = el.getAttribute('style') || '';
    var computedColor = window.getComputedStyle(el).color;

    // Check if text is black or very dark (invisible on dark bg)
    if (computedColor === 'rgb(0, 0, 0)' || style.indexOf('#000') !== -1 || style.indexOf('rgb(0, 0, 0)') !== -1) {
      // Look at the text content for clues
      var text = (el.textContent || '').trim();

      // Check parent/sibling context for arrow direction
      var parent = el.parentElement;
      var parentHTML = parent ? parent.innerHTML : '';
      var hasDown = parentHTML.indexOf('▼') !== -1 || parentHTML.indexOf('↓') !== -1;
      var hasUp = parentHTML.indexOf('▲') !== -1 || parentHTML.indexOf('↑') !== -1;

      // Also check if the value itself is negative
      if (text.indexOf('-') === 0 || hasDown) {
        el.style.setProperty('color', '#EF4444', 'important');
      } else if (hasUp || (text.match && text.match(/^[+0-9]/))) {
        el.style.setProperty('color', '#22C55E', 'important');
      } else {
        // Default: make it visible at least
        el.style.setProperty('color', '#94A3B8', 'important');
      }
    }
  }
}

// Run periodically since the widget updates dynamically
setInterval(fixColors, 500);
// Also run after initial load
setTimeout(fixColors, 2000);
setTimeout(fixColors, 4000);
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
