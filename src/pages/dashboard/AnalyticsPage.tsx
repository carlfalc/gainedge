import { C } from "@/lib/mock-data";

export default function AnalyticsPage() {
  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Analytics</h1>
      <p style={{ color: C.sec, fontSize: 13 }}>Analytics will read from the Falconer trades table — wiring underway.</p>
    </div>
  );
}
