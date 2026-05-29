import { C } from "@/lib/mock-data";

export default function CalendarPage() {
  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Calendar</h1>
      <p style={{ color: C.sec, fontSize: 13 }}>Calendar will surface Falconer trade days — wiring underway.</p>
    </div>
  );
}
