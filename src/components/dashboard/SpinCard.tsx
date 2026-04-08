import { useState } from "react";
import { C } from "@/lib/mock-data";

interface SpinCardProps {
  front: { label: string; value: string; sub?: string };
  back: { label: string; value: string };
  color: string;
}

export function SpinCard({ front, back, color }: SpinCardProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
      onTouchStart={() => setFlipped(f => !f)}
      style={{ perspective: 800, cursor: "pointer", flex: 1, minWidth: 0 }}
    >
      <div style={{
        position: "relative", width: "100%", height: 100,
        transformStyle: "preserve-3d",
        transition: "transform 0.6s ease",
        transform: flipped ? "rotateX(180deg)" : "rotateX(0deg)",
      }}>
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: "14px 18px", display: "flex", flexDirection: "column", justifyContent: "center",
          borderTop: `2px solid ${color}`,
        }}>
          <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{front.label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: C.text, marginTop: 4 }}>{front.value}</div>
          {front.sub && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>{front.sub}</div>}
        </div>
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          transform: "rotateX(180deg)",
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: "14px 18px", display: "flex", flexDirection: "column", justifyContent: "center",
          borderTop: `2px solid ${color}`,
        }}>
          <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{back.label}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 6, lineHeight: 1.5 }}>{back.value}</div>
        </div>
      </div>
    </div>
  );
}
