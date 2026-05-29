import { C } from "@/lib/mock-data";

export default function DashboardHome() {
  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Falconer v7 TP3</h1>
      <p style={{ color: C.sec, fontSize: 14, marginBottom: 24, maxWidth: 640 }}>
        Strategy wipe complete. Configure live execution and view trades on the{" "}
        <a href="/dashboard/strategy" style={{ color: C.jade }}>Strategy</a> page,
        run historical tests on the{" "}
        <a href="/dashboard/backtesting" style={{ color: C.jade }}>Backtesting</a> page.
      </p>
    </div>
  );
}
