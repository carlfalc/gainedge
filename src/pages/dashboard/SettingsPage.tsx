import { C } from "@/lib/mock-data";

export default function SettingsPage() {
  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Settings</h1>
      <p style={{ color: C.sec, fontSize: 13, maxWidth: 640 }}>
        Strategy-specific controls moved to the{" "}
        <a href="/dashboard/strategy" style={{ color: C.jade }}>Strategy</a> page.
        Account, broker, and notification settings will be wired here next.
      </p>
    </div>
  );
}
