import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3 } from "lucide-react";

interface VersionStats {
  winRate: number;
  totalSignals: number;
  avgConfidence: number;
  wins: number;
  losses: number;
}

const EMPTY: VersionStats = { winRate: 0, totalSignals: 0, avgConfidence: 0, wins: 0, losses: 0 };

export default function FalconerPerformancePanel() {
  const [v1, setV1] = useState<VersionStats>(EMPTY);
  const [v2, setV2] = useState<VersionStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    // Get all signals and their linked scan_results to determine version
    const { data: signals } = await supabase
      .from("signals")
      .select("result, confidence, scan_result_id")
      .neq("result", "pending");

    if (!signals || signals.length === 0) { setLoading(false); return; }

    // Get scan_result IDs to check reasoning for version tag
    const scanIds = signals.filter(s => s.scan_result_id).map(s => s.scan_result_id!);
    const { data: scans } = await supabase
      .from("scan_results")
      .select("id, reasoning")
      .in("id", scanIds.length > 0 ? scanIds : ["none"]);

    const scanMap = new Map((scans || []).map(s => [s.id, s.reasoning || ""]));

    const v1Stats = { ...EMPTY };
    const v2Stats = { ...EMPTY };

    for (const sig of signals) {
      const reasoning = sig.scan_result_id ? (scanMap.get(sig.scan_result_id) || "") : "";
      const isV2 = reasoning.includes("[RON V2]") || reasoning.includes("[RON]");
      const stats = isV2 ? v2Stats : v1Stats;

      stats.totalSignals++;
      stats.avgConfidence += sig.confidence;
      if (sig.result === "win") stats.wins++;
      if (sig.result === "loss") stats.losses++;
    }

    const calc = (s: VersionStats) => {
      const total = s.wins + s.losses;
      s.winRate = total > 0 ? Math.round((s.wins / total) * 100) : 0;
      s.avgConfidence = s.totalSignals > 0 ? Math.round((s.avgConfidence / s.totalSignals) * 10) / 10 : 0;
    };
    calc(v1Stats);
    calc(v2Stats);
    setV1(v1Stats);
    setV2(v2Stats);
    setLoading(false);
  };

  if (loading) return null;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <BarChart3 size={16} color={C.purple} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>V1 vs V2 Performance</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <StatBlock label="V1 (Legacy)" color={C.amber} stats={v1} />
        <StatBlock label="V2 (Knowledge Base)" color={C.jade} stats={v2} />
      </div>
    </div>
  );
}

function StatBlock({ label, color, stats }: { label: string; color: string; stats: VersionStats }) {
  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: 14, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 10, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Metric label="Win Rate" value={`${stats.winRate}%`} color={stats.winRate >= 60 ? C.jade : stats.winRate >= 40 ? C.amber : C.red} />
        <Metric label="Total Signals" value={String(stats.totalSignals)} color={C.text} />
        <Metric label="Avg Confidence" value={String(stats.avgConfidence)} color={C.blue} />
        <Metric label="W/L" value={`${stats.wins}/${stats.losses}`} color={C.sec} />
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: C.sec, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}
