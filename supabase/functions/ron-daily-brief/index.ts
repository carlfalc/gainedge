import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SymbolStats {
  symbol: string;
  wins: number;
  losses: number;
  expired: number;
  total: number;
  winRate: number;
  avgWinPips: number;
  avgLossPips: number;
  bestSession: string | null;
  bestSessionWR: number;
  bestPattern: string | null;
  bestPatternWR: number;
  bestPatternTotal: number;
  worstSession: string | null;
  worstSessionWR: number;
  worstPattern: string | null;
  worstPatternWR: number;
  worstPatternTotal: number;
}

function buildSymbolStats(outcomes: any[]): SymbolStats[] {
  const map: Record<string, any[]> = {};
  for (const o of outcomes) {
    if (!map[o.symbol]) map[o.symbol] = [];
    map[o.symbol].push(o);
  }

  return Object.entries(map).map(([symbol, rows]) => {
    const wins = rows.filter(r => r.result === "WIN").length;
    const losses = rows.filter(r => r.result === "LOSS").length;
    const expired = rows.filter(r => r.result === "EXPIRED").length;
    const total = rows.length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    const winPips = rows.filter(r => r.result === "WIN").map(r => Math.abs(r.pnl_pips || 0));
    const lossPips = rows.filter(r => r.result === "LOSS").map(r => Math.abs(r.pnl_pips || 0));
    const avgWinPips = winPips.length > 0 ? +(winPips.reduce((a, b) => a + b, 0) / winPips.length).toFixed(1) : 0;
    const avgLossPips = lossPips.length > 0 ? +(lossPips.reduce((a, b) => a + b, 0) / lossPips.length).toFixed(1) : 0;

    // Best/worst session
    const sessionMap: Record<string, { w: number; t: number }> = {};
    for (const r of rows) {
      const s = r.session || "unknown";
      if (!sessionMap[s]) sessionMap[s] = { w: 0, t: 0 };
      sessionMap[s].t++;
      if (r.result === "WIN") sessionMap[s].w++;
    }
    const sessions = Object.entries(sessionMap).filter(([, v]) => v.t >= 2).map(([k, v]) => ({ session: k, wr: Math.round((v.w / v.t) * 100), total: v.t }));
    sessions.sort((a, b) => b.wr - a.wr);
    const bestSess = sessions[0] || null;
    const worstSess = sessions[sessions.length - 1] || null;

    // Best/worst pattern
    const patternMap: Record<string, { w: number; t: number }> = {};
    for (const r of rows) {
      if (!r.pattern_active) continue;
      if (!patternMap[r.pattern_active]) patternMap[r.pattern_active] = { w: 0, t: 0 };
      patternMap[r.pattern_active].t++;
      if (r.result === "WIN") patternMap[r.pattern_active].w++;
    }
    const patterns = Object.entries(patternMap).filter(([, v]) => v.t >= 2).map(([k, v]) => ({ pattern: k, wr: Math.round((v.w / v.t) * 100), total: v.t, wins: v.w }));
    patterns.sort((a, b) => b.wr - a.wr);
    const bestPat = patterns[0] || null;
    const worstPat = patterns[patterns.length - 1] || null;

    return {
      symbol, wins, losses, expired, total, winRate, avgWinPips, avgLossPips,
      bestSession: bestSess?.session || null, bestSessionWR: bestSess?.wr || 0,
      bestPattern: bestPat?.pattern || null, bestPatternWR: bestPat?.wr || 0, bestPatternTotal: bestPat?.total || 0,
      worstSession: worstSess?.session || null, worstSessionWR: worstSess?.wr || 0,
      worstPattern: worstPat?.pattern || null, worstPatternWR: worstPat?.wr || 0, worstPatternTotal: worstPat?.total || 0,
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Get all users
    const { data: users } = await supabase.from("profiles").select("id, full_name, nickname").limit(500);
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let insightsCreated = 0;

    for (const user of users) {
      // This week's outcomes
      const { data: thisWeek } = await supabase
        .from("signal_outcomes")
        .select("symbol, result, pnl_pips, session, pattern_active, direction, confidence")
        .eq("user_id", user.id)
        .gte("resolved_at", sevenDaysAgo)
        .limit(500);

      if (!thisWeek || thisWeek.length < 2) continue; // Need at least 2 outcomes

      // Last week's outcomes (for comparison)
      const { data: lastWeek } = await supabase
        .from("signal_outcomes")
        .select("symbol, result, pnl_pips")
        .eq("user_id", user.id)
        .gte("resolved_at", fourteenDaysAgo)
        .lt("resolved_at", sevenDaysAgo)
        .limit(500);

      const thisStats = buildSymbolStats(thisWeek);
      const lastStats = buildSymbolStats(lastWeek || []);

      // ─── Overall performance ───
      const totalWins = thisWeek.filter(o => o.result === "WIN").length;
      const totalLosses = thisWeek.filter(o => o.result === "LOSS").length;
      const totalTrades = thisWeek.length;
      const overallWR = Math.round((totalWins / totalTrades) * 100);

      const lastTotalWins = (lastWeek || []).filter(o => o.result === "WIN").length;
      const lastTotal = (lastWeek || []).length;
      const lastWR = lastTotal > 0 ? Math.round((lastTotalWins / lastTotal) * 100) : null;

      // ─── Best performer ───
      thisStats.sort((a, b) => b.winRate - a.winRate);
      const bestSymbol = thisStats[0];

      // ─── Worst performer ───
      const worstSymbol = thisStats.filter(s => s.total >= 3).sort((a, b) => a.winRate - b.winRate)[0] || null;

      // ─── Best single setup ───
      let bestSetup = "";
      let bestSetupDetail = "";
      const setupCandidates: { label: string; wr: number; wins: number; total: number }[] = [];
      for (const s of thisStats) {
        if (s.bestPattern && s.bestPatternTotal >= 2) {
          setupCandidates.push({
            label: `${s.symbol} ${s.bestPattern}${s.bestSession ? ` during ${s.bestSession}` : ""}`,
            wr: s.bestPatternWR, wins: Math.round(s.bestPatternWR * s.bestPatternTotal / 100), total: s.bestPatternTotal,
          });
        }
        if (s.bestSession && s.total >= 3) {
          setupCandidates.push({
            label: `${s.symbol} during ${s.bestSession} session`,
            wr: s.bestSessionWR, wins: Math.round(s.bestSessionWR * s.total / 100), total: s.total,
          });
        }
      }
      setupCandidates.sort((a, b) => b.wr - a.wr || b.total - a.total);
      if (setupCandidates[0]) {
        const top = setupCandidates[0];
        bestSetup = `Best setup this week: ${top.label}, ${top.wins}/${top.total} wins (${top.wr}%)`;
        bestSetupDetail = bestSetup;
      }

      // ─── Worst setup ───
      let worstSetup = "";
      const worstCandidates = setupCandidates.filter(c => c.total >= 3).sort((a, b) => a.wr - b.wr);
      if (worstCandidates[0] && worstCandidates[0].wr < 50) {
        const w = worstCandidates[0];
        worstSetup = `Worst setup: ${w.label}, ${w.wins}/${w.total} wins (${w.wr}%) — avoid until conditions change`;
      }

      // ─── Week-over-week comparison ───
      let weekComparison = "";
      if (lastWR !== null && lastTotal >= 3) {
        const diff = overallWR - lastWR;
        if (diff > 5) weekComparison = `Performance improving: ${overallWR}% win rate this week vs ${lastWR}% last week (+${diff}pp) 📈`;
        else if (diff < -5) weekComparison = `Performance declining: ${overallWR}% this week vs ${lastWR}% last week (${diff}pp) 📉. Consider tightening risk.`;
        else weekComparison = `Performance steady: ${overallWR}% this week vs ${lastWR}% last week.`;
      }

      // ─── Build per-instrument breakdown ───
      const instrumentLines: string[] = [];
      for (const s of thisStats) {
        if (s.total < 2) continue;
        let line = `• ${s.symbol}: ${s.winRate}% WR (${s.wins}W/${s.losses}L), avg win ${s.avgWinPips} pips, avg loss ${s.avgLossPips} pips`;
        if (s.bestSession) line += `. Best in ${s.bestSession} (${s.bestSessionWR}%)`;
        if (s.bestPattern) line += `. Top pattern: ${s.bestPattern} (${s.bestPatternWR}%)`;

        // Compare to last week
        const lastS = lastStats.find(l => l.symbol === s.symbol);
        if (lastS && lastS.total >= 2) {
          const d = s.winRate - lastS.winRate;
          if (d > 10) line += ` ↑ +${d}pp vs last week`;
          else if (d < -10) line += ` ↓ ${d}pp vs last week`;
        }
        instrumentLines.push(line);
      }

      // ─── Compose the plain English summary ───
      const userName = user.nickname || user.full_name || "Trader";
      const summaryParts: string[] = [];

      summaryParts.push(`RON Daily Brief for ${userName}: ${totalTrades} signals this week — ${totalWins}W/${totalLosses}L (${overallWR}% win rate).`);

      if (bestSymbol && bestSymbol.total >= 2) {
        summaryParts.push(`Your best performer was ${bestSymbol.symbol} with ${bestSymbol.winRate}% win rate.`);
      }
      if (worstSymbol && worstSymbol.winRate < 50) {
        summaryParts.push(`${worstSymbol.symbol} struggled at ${worstSymbol.winRate}% — consider reducing position size or pausing.`);
      }

      // Session-specific advice
      for (const s of thisStats) {
        if (s.worstSession && s.worstSessionWR < 40 && s.bestSession && s.bestSessionWR > 60) {
          summaryParts.push(`${s.symbol}: focus on ${s.bestSession} session (${s.bestSessionWR}% WR) and avoid ${s.worstSession} (${s.worstSessionWR}%).`);
        }
      }

      // Pattern callouts
      for (const s of thisStats) {
        if (s.bestPattern && s.bestPatternWR >= 70 && s.bestPatternTotal >= 3) {
          summaryParts.push(`${s.bestPattern} on ${s.symbol} has been reliable (${s.bestPatternWR}%, ${s.bestPatternTotal} trades).`);
        }
      }

      if (weekComparison) summaryParts.push(weekComparison);

      const fullSummary = summaryParts.join(" ");

      // ─── Build detailed title ───
      const title = `📋 RON Daily Brief — ${overallWR}% WR (${totalWins}W/${totalLosses}L)`;

      // ─── Build full description ───
      const descParts: string[] = [fullSummary, ""];
      if (instrumentLines.length > 0) {
        descParts.push("**Instrument Breakdown:**");
        descParts.push(...instrumentLines);
        descParts.push("");
      }
      if (bestSetupDetail) descParts.push(`✅ ${bestSetupDetail}`);
      if (worstSetup) descParts.push(`⛔ ${worstSetup}`);

      const description = descParts.join("\n");

      // ─── Dedup: one brief per user per day ───
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data: existing } = await supabase
        .from("insights")
        .select("id")
        .eq("user_id", user.id)
        .eq("insight_type", "ron_daily_brief")
        .gte("created_at", todayStart.toISOString())
        .limit(1);

      if (existing && existing.length > 0) continue; // Already sent today

      await supabase.from("insights").insert({
        user_id: user.id,
        insight_type: "ron_daily_brief",
        title,
        description,
        severity: overallWR >= 60 ? "positive" : overallWR >= 45 ? "info" : "negative",
        data: {
          overall_wr: overallWR,
          total_trades: totalTrades,
          wins: totalWins,
          losses: totalLosses,
          best_symbol: bestSymbol?.symbol,
          best_setup: bestSetupDetail,
          worst_setup: worstSetup,
          week_comparison: weekComparison,
          instrument_stats: thisStats.map(s => ({
            symbol: s.symbol, wr: s.winRate, wins: s.wins, losses: s.losses,
            avg_win_pips: s.avgWinPips, avg_loss_pips: s.avgLossPips,
            best_session: s.bestSession, best_pattern: s.bestPattern,
          })),
        },
      });
      insightsCreated++;
    }

    return new Response(JSON.stringify({ success: true, insights_created: insightsCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ron-daily-brief error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
