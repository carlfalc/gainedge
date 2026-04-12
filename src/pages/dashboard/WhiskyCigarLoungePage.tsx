import { C } from "@/lib/mock-data";
import { Wine } from "lucide-react";

export default function WhiskyCigarLoungePage() {
  return (
    <div style={{ padding: 32, minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Wine size={28} style={{ color: "#D4A574" }} />
        <h1 style={{ color: C.text, fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>
          WHISKY & CIGAR LOUNGE
        </h1>
      </div>
      <p style={{ color: C.text, fontSize: 14, opacity: 0.7 }}>
        Coming soon — this is your exclusive lounge. More details and UI to follow.
      </p>
    </div>
  );
}
