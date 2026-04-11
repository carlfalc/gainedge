import { useState, useRef, useCallback, useEffect } from "react";
import { X, Mic, MicOff, PhoneOff, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

interface AskRonModalProps {
  open: boolean;
  onClose: () => void;
  context: {
    page?: string;
    instrument?: string;
    timeframe?: string;
    pattern?: string;
    price?: string;
    sessionLabel?: string;
  };
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ron-chat`;
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ron-tts`;
const STT_TOKEN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ron-stt-token`;

async function streamChat(
  messages: Msg[],
  context: AskRonModalProps["context"],
  onDelta: (text: string) => void,
  onDone: () => void,
  signal?: AbortSignal
) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, context }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const err = await resp.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { onDone(); return; }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch { /* partial JSON, ignore */ }
    }
  }
  onDone();
}

export default function AskRonModal({ open, onClose, context }: AskRonModalProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState<string>("Ready");
  const [orbScale, setOrbScale] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Animate orb when speaking
  useEffect(() => {
    if (!isSpeaking) {
      setOrbScale(1);
      cancelAnimationFrame(animFrameRef.current);
      return;
    }
    const animate = () => {
      if (analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setOrbScale(1 + (avg / 255) * 0.6);
      } else {
        // Fallback pulse
        setOrbScale(1 + Math.sin(Date.now() / 200) * 0.15);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isSpeaking]);

  const playTTS = useCallback(async (text: string) => {
    try {
      setIsSpeaking(true);
      setStatus("RON is speaking...");
      const resp = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text: text.slice(0, 4000) }), // ElevenLabs limit
      });
      if (!resp.ok) throw new Error("TTS failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

      // Set up audio with analyser for orb animation
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const audio = new Audio(url);
      audioRef.current = audio;
      const source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);

      audio.onended = () => {
        setIsSpeaking(false);
        setStatus("Ready");
        analyserRef.current = null;
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch (e) {
      console.error("TTS error:", e);
      setIsSpeaking(false);
      setStatus("Ready");
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return;

    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsThinking(true);
    setStatus("RON is thinking...");

    let assistantText = "";
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await streamChat(
        newMessages,
        context,
        (chunk) => {
          assistantText += chunk;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantText } : m);
            }
            return [...prev, { role: "assistant", content: assistantText }];
          });
        },
        () => {
          setIsThinking(false);
          setStatus("Ready");
          // Auto-play TTS for RON's response
          if (assistantText.trim()) {
            playTTS(assistantText);
          }
        },
        abort.signal
      );
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Chat error:", e);
        setMessages(prev => [...prev, { role: "assistant", content: `Sorry, I encountered an error: ${e.message}` }]);
      }
      setIsThinking(false);
      setStatus("Ready");
    }
  }, [messages, isThinking, context, playTTS]);

  // Web Speech API for mic (browser-native, no token needed)
  const toggleMic = useCallback(async () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setStatus("Ready");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus("Speech recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) {
        sendMessage(transcript);
      }
      setIsListening(false);
      setStatus("Ready");
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setStatus("Ready");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setStatus("Listening...");
  }, [isListening, sendMessage]);

  const endConversation = useCallback(() => {
    abortRef.current?.abort();
    audioRef.current?.pause();
    recognitionRef.current?.stop();
    setMessages([]);
    setIsThinking(false);
    setIsListening(false);
    setIsSpeaking(false);
    setStatus("Ready");
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", alignItems: "center",
      animation: "fade-in 0.3s ease-out",
    }}>
      {/* Header */}
      <div style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <span style={{ color: "#00CFA5", fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
          Talk to RON
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={endConversation}
            title="End Conversation"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 20, border: "none", cursor: "pointer",
              background: "rgba(239,68,68,0.15)", color: "#EF4444",
              fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.3)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.15)"}
          >
            <PhoneOff size={16} /> End
          </button>
          <button
            onClick={endConversation}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 10, border: "none", cursor: "pointer",
              background: "rgba(255,255,255,0.06)", color: "#94A3B8",
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Orb + Conversation area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 640, padding: "0 16px", overflow: "hidden" }}>
        {/* Animated Orb */}
        <div style={{
          marginTop: messages.length > 0 ? 20 : 80,
          marginBottom: 20,
          width: 120, height: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle at 40% 40%, #00CFA5, #0EA5E9, #6366F1)`,
          boxShadow: `0 0 ${40 + orbScale * 20}px rgba(0,207,165,${0.3 + orbScale * 0.15}), 0 0 ${80 + orbScale * 40}px rgba(14,165,233,${0.15 + orbScale * 0.1})`,
          transform: `scale(${orbScale})`,
          transition: isSpeaking ? "none" : "all 0.5s ease",
          animation: isListening ? "ron-listen 1.5s ease-in-out infinite" : isThinking ? "ron-think 1s ease-in-out infinite" : "ron-idle 4s ease-in-out infinite",
          flexShrink: 0,
        }} />

        {/* Status */}
        <div style={{
          color: isListening ? "#00CFA5" : isThinking ? "#F59E0B" : isSpeaking ? "#0EA5E9" : "#64748B",
          fontSize: 13, fontWeight: 600, marginBottom: 16,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {status}
        </div>

        {/* Chat messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, width: "100%", overflowY: "auto",
            display: "flex", flexDirection: "column", gap: 12,
            paddingBottom: 16,
          }}
        >
          {messages.length === 0 && (
            <div style={{ textAlign: "center", color: "#64748B", fontSize: 14, marginTop: 24, fontFamily: "'DM Sans', sans-serif" }}>
              <p style={{ marginBottom: 8 }}>Ask me anything about trading.</p>
              <p style={{ fontSize: 12, opacity: 0.7 }}>Tap the mic or type below to get started.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "10px 16px",
              borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.role === "user"
                ? "linear-gradient(135deg, #00CFA5, #0EA5E9)"
                : "rgba(255,255,255,0.06)",
              color: msg.role === "user" ? "#fff" : "#E2E8F0",
              fontSize: 14,
              lineHeight: 1.5,
              fontFamily: "'DM Sans', sans-serif",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {msg.content}
              {i === messages.length - 1 && msg.role === "assistant" && isThinking && (
                <span style={{ opacity: 0.5 }}>▍</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom controls */}
      <div style={{
        width: "100%", maxWidth: 640, padding: "16px 24px 24px",
        display: "flex", alignItems: "center", gap: 12,
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}>
        {/* Mic button */}
        <button
          onClick={toggleMic}
          disabled={isThinking}
          style={{
            width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isListening
              ? "linear-gradient(135deg, #EF4444, #DC2626)"
              : "linear-gradient(135deg, #00CFA5, #0EA5E9)",
            color: "#fff",
            boxShadow: isListening
              ? "0 0 20px rgba(239,68,68,0.4)"
              : "0 0 20px rgba(0,207,165,0.3)",
            transition: "all 0.3s",
            opacity: isThinking ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          {isListening ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        {/* Text input */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center",
          background: "rgba(255,255,255,0.06)",
          borderRadius: 28, padding: "0 4px 0 18px",
          border: "1px solid rgba(255,255,255,0.1)",
        }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") sendMessage(input); }}
            placeholder="Type a question..."
            disabled={isThinking}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: "#E2E8F0", fontSize: 14, padding: "14px 0",
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isThinking}
            style={{
              width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: input.trim() ? "#00CFA5" : "transparent",
              color: input.trim() ? "#fff" : "#475569",
              transition: "all 0.2s",
            }}
          >
            {isThinking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ron-idle {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes ron-listen {
          0%, 100% { transform: scale(1); box-shadow: 0 0 40px rgba(0,207,165,0.3); }
          50% { transform: scale(1.12); box-shadow: 0 0 60px rgba(0,207,165,0.5); }
        }
        @keyframes ron-think {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
