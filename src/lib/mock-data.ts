// ── MOCK DATA FOR DASHBOARD ──────────────────────────────

export const C = {
  bg: "#080B12", bg2: "#0D1117", card: "#111724", cardH: "#161D2B",
  border: "rgba(255,255,255,0.06)", borderH: "rgba(255,255,255,0.14)", nav: "rgba(8,11,18,0.88)",
  jade: "#00CFA5", teal: "#06B6D4", text: "#E4E9F0", sec: "#8892A4", muted: "#555F73",
  green: "#22C55E", red: "#EF4444", amber: "#F59E0B", pink: "#F472B6", purple: "#A78BFA",
  blue: "#60A5FA", orange: "#FB923C", cyan: "#22D3EE", lime: "#84CC16",
};

export const INSTRUMENTS = [
  { symbol: "NAS100", direction: "BUY" as const, confidence: 6, color: C.green, pnl: "+$1,240", spark: [20, 22, 21, 25, 28, 27, 30, 32, 35, 34, 38], adx: 28.4, rsi: 62, macd: "Bullish", stochRsi: 71, entry: "24,059", tp: "24,277", sl: "23,950", rr: "2:1", reasoning: "EMA 4 crossed above EMA 17 on 15m HA. ADX >25 confirms trend. RSI not overbought. MACD histogram positive and expanding. London session high volume confirms momentum." },
  { symbol: "US30", direction: "BUY" as const, confidence: 5, color: C.green, pnl: "+$890", spark: [40, 42, 41, 43, 44, 43, 46, 45, 47, 46, 48], adx: 24.1, rsi: 58, macd: "Bullish", stochRsi: 64, entry: "42,180", tp: "42,340", sl: "42,100", rr: "2:1", reasoning: "Moderate bullish setup. EMA crossover confirmed. ADX near threshold. Correlation warning with NAS100 — trade one only." },
  { symbol: "AUDUSD", direction: "WAIT" as const, confidence: 3, color: C.amber, pnl: "+$320", spark: [68, 69, 68, 69, 69, 68, 69, 69, 70, 69, 69], adx: 14.2, rsi: 49, macd: "Neutral", stochRsi: 45, entry: "—", tp: "—", sl: "—", rr: "—", reasoning: "No clear trend. ADX below 20 signals ranging market. Wait for breakout confirmation before entering." },
  { symbol: "NZDUSD", direction: "WAIT" as const, confidence: 3, color: C.amber, pnl: "+$180", spark: [56, 57, 56, 57, 57, 56, 57, 57, 57, 57, 57], adx: 12.8, rsi: 47, macd: "Neutral", stochRsi: 42, entry: "—", tp: "—", sl: "—", rr: "—", reasoning: "Choppy price action. Correlated with AUDUSD — avoid doubling exposure. Wait for London breakout." },
  { symbol: "XAUUSD", direction: "NO TRADE" as const, confidence: 2, color: C.red, pnl: "-$45", spark: [46, 47, 46, 45, 46, 47, 46, 45, 46, 47, 46], adx: 10.5, rsi: 51, macd: "Bearish", stochRsi: 38, entry: "—", tp: "—", sl: "—", rr: "—", reasoning: "Low conviction. ADX very weak. News event approaching — avoid until volatility settles." },
];

export const EQUITY_CURVE = [0, 245, 125, 505, 505, 420, 930, 1105, 895, 1315, 1410, 1365, 2045, 2045, 2355, 2180, 2405, 2405, 2315, 2760, 3320, 3290, 3485, 3855, 3855, 4140, 3985, 4595, 4735, 4735, 5160];

export const SIGNAL_HISTORY = [
  { id: 1, date: "2026-04-06 09:15", instrument: "NAS100", direction: "BUY", confidence: 6, entry: "24,059", tp: "24,277", sl: "23,950", rr: "2:1", outcome: "Pending" as const, pnl: "—", reasoning: "EMA crossover confirmed on 15m HA. Strong momentum." },
  { id: 2, date: "2026-04-05 14:30", instrument: "US30", direction: "BUY", confidence: 5, entry: "42,100", tp: "42,260", sl: "42,020", rr: "2:1", outcome: "Win" as const, pnl: "+$320", reasoning: "London overlap entry. ADX 26. Clean breakout." },
  { id: 3, date: "2026-04-05 10:00", instrument: "NAS100", direction: "BUY", confidence: 7, entry: "23,950", tp: "24,180", sl: "23,835", rr: "2:1", outcome: "Win" as const, pnl: "+$460", reasoning: "Strong EMA separation. RSI bounce from 40." },
  { id: 4, date: "2026-04-04 15:45", instrument: "XAUUSD", direction: "SELL", confidence: 4, entry: "2,340", tp: "2,325", sl: "2,348", rr: "1.9:1", outcome: "Loss" as const, pnl: "-$160", reasoning: "Bearish divergence on RSI. Stopped out by news spike." },
  { id: 5, date: "2026-04-04 09:30", instrument: "AUDUSD", direction: "BUY", confidence: 5, entry: "0.6580", tp: "0.6610", sl: "0.6565", rr: "2:1", outcome: "Win" as const, pnl: "+$180", reasoning: "Asian session breakout. Clean EMA cross." },
  { id: 6, date: "2026-04-03 14:00", instrument: "NAS100", direction: "BUY", confidence: 8, entry: "23,800", tp: "24,020", sl: "23,690", rr: "2:1", outcome: "Win" as const, pnl: "+$440", reasoning: "High conviction. All indicators aligned." },
  { id: 7, date: "2026-04-03 10:15", instrument: "US30", direction: "SELL", confidence: 3, entry: "41,950", tp: "41,830", sl: "42,010", rr: "2:1", outcome: "Loss" as const, pnl: "-$120", reasoning: "Counter-trend attempt. Low ADX invalidated." },
  { id: 8, date: "2026-04-02 09:00", instrument: "NZDUSD", direction: "BUY", confidence: 4, entry: "0.5920", tp: "0.5945", sl: "0.5907", rr: "1.9:1", outcome: "Win" as const, pnl: "+$125", reasoning: "London open momentum. Clean setup." },
  { id: 9, date: "2026-04-01 14:30", instrument: "NAS100", direction: "BUY", confidence: 6, entry: "23,650", tp: "23,870", sl: "23,540", rr: "2:1", outcome: "Win" as const, pnl: "+$440", reasoning: "Strong trend day. Multiple confirmations." },
  { id: 10, date: "2026-04-01 10:00", instrument: "XAUUSD", direction: "SELL", confidence: 5, entry: "2,355", tp: "2,340", sl: "2,363", rr: "1.9:1", outcome: "Win" as const, pnl: "+$300", reasoning: "Bearish EMA cross. ADX expanding." },
];

export const CALENDAR_DATA: Record<string, { pnl: number; wins: number; losses: number; trades: { instrument: string; pnl: number; direction: string }[] }> = {
  "2026-04-01": { pnl: 740, wins: 2, losses: 0, trades: [{ instrument: "NAS100", pnl: 440, direction: "BUY" }, { instrument: "XAUUSD", pnl: 300, direction: "SELL" }] },
  "2026-04-02": { pnl: 125, wins: 1, losses: 0, trades: [{ instrument: "NZDUSD", pnl: 125, direction: "BUY" }] },
  "2026-04-03": { pnl: 320, wins: 1, losses: 1, trades: [{ instrument: "NAS100", pnl: 440, direction: "BUY" }, { instrument: "US30", pnl: -120, direction: "SELL" }] },
  "2026-04-04": { pnl: 20, wins: 1, losses: 1, trades: [{ instrument: "AUDUSD", pnl: 180, direction: "BUY" }, { instrument: "XAUUSD", pnl: -160, direction: "SELL" }] },
  "2026-04-05": { pnl: 780, wins: 2, losses: 0, trades: [{ instrument: "NAS100", pnl: 460, direction: "BUY" }, { instrument: "US30", pnl: 320, direction: "BUY" }] },
  "2026-04-07": { pnl: -200, wins: 0, losses: 1, trades: [{ instrument: "XAUUSD", pnl: -200, direction: "SELL" }] },
  "2026-04-08": { pnl: 550, wins: 2, losses: 0, trades: [{ instrument: "NAS100", pnl: 350, direction: "BUY" }, { instrument: "AUDUSD", pnl: 200, direction: "BUY" }] },
  "2026-04-09": { pnl: 310, wins: 1, losses: 0, trades: [{ instrument: "US30", pnl: 310, direction: "BUY" }] },
  "2026-04-10": { pnl: -150, wins: 0, losses: 1, trades: [{ instrument: "NZDUSD", pnl: -150, direction: "BUY" }] },
  "2026-04-11": { pnl: 680, wins: 2, losses: 0, trades: [{ instrument: "NAS100", pnl: 480, direction: "BUY" }, { instrument: "XAUUSD", pnl: 200, direction: "SELL" }] },
};

export const JOURNAL_ENTRIES: Record<string, { notes: string; tags: string[]; summary: string }> = {
  "2026-04-01": { notes: "Great start to the month. Both setups hit TP with clean entries. NAS100 trend was strong all session.", tags: ["EMA Cross", "Trend Day"], summary: "London session. 2 trades, both winners." },
  "2026-04-02": { notes: "Only one setup met conviction threshold. Patience paid off.", tags: ["Patience"], summary: "Asian session setup on NZDUSD." },
  "2026-04-03": { notes: "NAS100 was excellent but US30 counter-trend attempt was a mistake. Need to stick to trend direction.", tags: ["Lesson", "Counter-trend"], summary: "Mixed day. 1W 1L." },
  "2026-04-04": { notes: "XAUUSD stopped out by news spike. Should have checked calendar. AUDUSD was clean.", tags: ["News Impact"], summary: "NY session. News event caused loss." },
  "2026-04-05": { notes: "Perfect day. Both setups from London overlap. High conviction entries only.", tags: ["London Overlap", "Perfect Day"], summary: "2 wins, $780 profit." },
};
