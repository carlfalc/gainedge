import { useEffect } from "react";
import InstrumentTrackingPanel from "@/components/dashboard/InstrumentTrackingPanel";
import { C } from "@/lib/mock-data";

export default function InstrumentsPopout() {
  useEffect(() => {
    document.title = "GAINEDGE — Instrument Tracking";
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#080B12", padding: 16 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/gainedge-logo.png" alt="GAINEDGE" style={{ height: 24 }} />
          <span style={{ fontSize: 11, color: C.sec, fontWeight: 500 }}>
            Instrument Tracking — Popout Window
          </span>
        </div>
        <span style={{ fontSize: 10, color: C.muted }}>
          Synced live with main dashboard · drag, hide & show all available
        </span>
      </div>
      <InstrumentTrackingPanel showPopOutButton={false} />
    </div>
  );
}
