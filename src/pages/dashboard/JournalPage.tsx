import { C } from "@/lib/mock-data";

export default function JournalPage() {
  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Journal</h1>
      <p style={{ color: C.sec, fontSize: 13 }}>Journal entries remain available. Falconer trades feed into the journal automatically.</p>
    </div>
  );
}
