import { C } from "@/lib/mock-data";
import { Wine, ExternalLink } from "lucide-react";

export default function WhiskyCigarLoungePage() {
  const isPopout = new URLSearchParams(window.location.search).get("popout") === "1";

  const handlePopOut = () => {
    window.open("/lounge-popout", "_blank", "noopener");
  };

  return (
    <div style={{ padding: 32, minHeight: isPopout ? "100vh" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Wine size={28} style={{ color: "#D4A574" }} />
        <h1 style={{ color: C.text, fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>
          WHISKY & CIGAR LOUNGE
        </h1>
        {!isPopout && (
          <button
            onClick={handlePopOut}
            style={{
              marginLeft: "auto",
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              background: "#111724", border: "1px solid rgba(255,255,255,0.1)",
              color: "#D4A574", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#F5D5B0"; e.currentTarget.style.borderColor = "rgba(212,165,116,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#D4A574"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
          >
            <ExternalLink size={14} />
            <span>Pop Out</span>
          </button>
        )}
      </div>
      <p style={{ color: C.text, fontSize: 14, opacity: 0.7 }}>
        Coming soon — this is your exclusive lounge. More details and UI to follow.
      </p>
    </div>
  );
}
