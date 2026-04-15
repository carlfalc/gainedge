import { useEffect, useRef } from "react";

export default function LiveQuotesTicker() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Set the global config
    (window as any).DukascopyApplet = {
      type: "runboard",
      params: {
        instruments:
          "EUR/USD,USD/JPY,GBP/USD,EUR/JPY,GBP/JPY,USD/CAD,XAU/USD,AUD/USD,USD/CHF,NZD/USD,E_Brent,E_SandP-500,E_DJE50XX,E_N225Jap",
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
        adv: "popup",
      },
    };

    const script = document.createElement("script");
    script.src = "https://freeserv-static.dukascopy.com/2.0/core.js";
    script.async = true;
    containerRef.current.appendChild(script);

    return () => {
      script.remove();
      delete (window as any).DukascopyApplet;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 30,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}
    />
  );
}
