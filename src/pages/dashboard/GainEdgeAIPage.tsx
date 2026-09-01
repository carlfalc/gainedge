import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Brain, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { toast } from "sonner";
import { askRonContextLabel, parseAskRonContext } from "@/lib/ask-ron-context";
import { ronDecisionRecordHref, ronDecisionRecordTitle } from "@/lib/ron-decision-explorer";

interface Conversation {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

const prompts = [
  "Summarise my stored Falconer records by instrument.",
  "Describe the available sample sizes by session and day.",
  "Explain my latest stored Falconer record and its evidence.",
  "What limitations or missing evidence are in my available records?",
];

/** Descriptive, availability-safe questions about an exact stored RON record. */
const contextPrompts = [
  "Explain the stored RON decision for this context, if available.",
  "Summarise warnings or caveats in the stored RON evidence, if available.",
];

/** Truthful scope note: the pair applies to new questions only. */
const CONTEXT_HISTORY_NOTE =
  "Context applies to new questions. Conversation history may include earlier questions from other contexts.";

export default function GainEdgeAIPage() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Conversation[]>([]);
  const [asking, setAsking] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const pair = parseAskRonContext(searchParams);

  const clearContext = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("instrument");
    next.delete("timeframe");
    setSearchParams(next, { replace: true });
  };

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("gainedge_ai_conversations")
      .select("id,question,answer,created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setHistory((data as unknown as Conversation[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const ask = async (text = question) => {
    const clean = text.trim();
    if (clean.length < 3 || asking) return;
    setQuestion("");
    setAsking(true);
    const { data, error } = await supabase.functions.invoke("gainedge-ai", {
      body: pair
        ? { question: clean, instrument: pair.instrument, timeframe: pair.timeframe }
        : { question: clean },
    });
    setAsking(false);
    if (error || !data?.answer) {
      toast.error(data?.error || error?.message || "RON is unavailable");
      return;
    }
    await load();
  };

  const clearHistory = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase
      .from("gainedge_ai_conversations")
      .delete()
      .eq("user_id", session.user.id);
    setHistory([]);
  };

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Brain size={27} style={{ color: C.jade }} />
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Ask RON</h1>
        </div>
        {history.length > 0 && (
          <button onClick={clearHistory} style={ghostButton}>
            <Trash2 size={14} /> Clear
          </button>
        )}
      </div>
      <p style={{ color: C.sec, fontSize: 15, marginBottom: 20 }}>
        RON is GainEdge's interactive assistant. Answers are based only on the evidence stored and available in your account.
      </p>

      {pair && (
        <div data-testid="ask-ron-context-chip" style={contextChip}>
          <span>{askRonContextLabel(pair)}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              data-testid="ask-ron-view-stored-record"
              onClick={() => navigate(ronDecisionRecordHref(pair.instrument, pair.timeframe))}
              aria-label={ronDecisionRecordTitle(pair.instrument, pair.timeframe)}
              title={ronDecisionRecordTitle(pair.instrument, pair.timeframe)}
              style={ghostButton}
            >
              View stored record
            </button>
            <button onClick={clearContext} style={ghostButton}>Clear context</button>
          </div>
        </div>
      )}

      {pair && history.length > 0 && (
        <div data-testid="ask-ron-context-history-note" style={contextHistoryNote}>
          {CONTEXT_HISTORY_NOTE}
        </div>
      )}

      {pair && (
        <div data-testid="ask-ron-context-prompts" style={{ marginBottom: 16 }}>
          <div style={{ color: C.sec, fontSize: 13, marginBottom: 8 }}>Ask about this stored context</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {contextPrompts.map(prompt => (
              <button
                key={prompt}
                data-testid="ask-ron-context-prompt"
                onClick={() => ask(prompt)}
                disabled={asking}
                style={promptButton}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {prompts.map(prompt => (
          <button key={prompt} onClick={() => ask(prompt)} disabled={asking} style={promptButton}>
            {prompt}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <textarea
          value={question}
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              ask();
            }
          }}
          placeholder="Ask RON…"
          rows={3}
          style={input}
        />
        <button onClick={() => ask()} disabled={asking || question.trim().length < 3} style={sendButton}>
          <Send size={18} />
          {asking ? "Analysing…" : "Ask"}
        </button>
      </div>

      {asking && <div style={{ ...card, color: C.sec }}>RON is reviewing the available evidence…</div>}
      {!asking && history.length === 0 && (
        <div style={{ ...card, color: C.sec, textAlign: "center" }}>
          No questions yet. RON answers from stored evidence and will state when the available evidence is insufficient.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {history.map(item => (
          <div key={item.id} style={card}>
            <div style={{ color: C.jade, fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{item.question}</div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 15 }}>{item.answer}</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 12 }}>
              {new Date(item.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <p style={{ color: C.muted, fontSize: 13, marginTop: 18 }}>
        Decision support only. Broker order placement is not enabled here.
      </p>
    </div>
  );
}

const card: React.CSSProperties = {
  padding: 18, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`,
};
const input: React.CSSProperties = {
  flex: 1, resize: "vertical", minHeight: 74, padding: 12, borderRadius: 10,
  background: C.bg2, border: `1px solid ${C.border}`, color: C.text, outline: "none",
};
const sendButton: React.CSSProperties = {
  minWidth: 125, display: "flex", alignItems: "center", justifyContent: "center",
  gap: 7, border: "none", borderRadius: 10, background: C.jade, color: "#020617",
  fontWeight: 800, cursor: "pointer",
};
const promptButton: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
  background: C.bg2, color: C.sec, fontSize: 13, cursor: "pointer",
};
const ghostButton: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: "transparent", color: C.sec, cursor: "pointer",
};
const contextChip: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
  padding: "8px 12px", borderRadius: 10, marginBottom: 16,
  background: C.bg2, border: `1px solid ${C.border}`, color: C.sec, fontSize: 14,
};
const contextHistoryNote: React.CSSProperties = {
  color: C.muted, fontSize: 13, marginTop: -8, marginBottom: 16, lineHeight: 1.5,
};
