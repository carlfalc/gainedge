import { useState, useRef, useCallback, useEffect } from "react";
import { X, Mic, MicOff, PhoneOff, Send, Loader2 } from "lucide-react";

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
    userName?: string;
    userId?: string;
  };
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ron-chat`;
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ron-tts`;

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
    body: JSON.stringify({ messages, context: { ...context, localHour: new Date().getHours() } }),
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

/* ─── Background floating particles ─── */
function BackgroundParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 30 }).map((_, i) => {
        const size = 2 + Math.random() * 4;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const delay = Math.random() * 8;
        const dur = 6 + Math.random() * 10;
        const hue = 160 + Math.random() * 60; // cyan to blue range
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              background: `hsla(${hue}, 80%, 60%, ${0.15 + Math.random() * 0.25})`,
              boxShadow: `0 0 ${size * 3}px hsla(${hue}, 80%, 60%, 0.3)`,
              animation: `ronParticleFloat ${dur}s ease-in-out ${delay}s infinite alternate`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ─── Main swirling orb with multiple layers ─── */
function PsychedelicOrb({
  scale,
  isListening,
  isThinking,
  isSpeaking,
}: {
  scale: number;
  isListening: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
}) {
  const state = isSpeaking ? "speaking" : isListening ? "listening" : isThinking ? "thinking" : "idle";

  return (
    <div
      className="relative flex-shrink-0"
      style={{
        width: 200,
        height: 200,
        transform: `scale(${scale})`,
        transition: isSpeaking ? "transform 0.05s linear" : "transform 0.5s ease",
      }}
    >
      {/* Outer glow ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "transparent",
          boxShadow: `
            0 0 60px rgba(0, 207, 165, ${0.2 + scale * 0.1}),
            0 0 120px rgba(14, 165, 233, ${0.1 + scale * 0.08}),
            0 0 180px rgba(99, 102, 241, ${0.05 + scale * 0.05})
          `,
          animation: "ronGlowPulse 3s ease-in-out infinite",
        }}
      />

      {/* Layer 1: Slow outer swirl */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(
            from 0deg,
            rgba(0, 207, 165, 0.6),
            rgba(14, 165, 233, 0.4),
            rgba(99, 102, 241, 0.5),
            rgba(168, 85, 247, 0.3),
            rgba(14, 165, 233, 0.4),
            rgba(0, 207, 165, 0.6)
          )`,
          filter: "blur(12px)",
          animation: `ronSwirl1 ${state === "speaking" ? "2s" : state === "listening" ? "3s" : "8s"} linear infinite`,
        }}
      />

      {/* Layer 2: Counter-rotating inner swirl */}
      <div
        className="absolute rounded-full"
        style={{
          inset: "15%",
          background: `conic-gradient(
            from 180deg,
            rgba(14, 165, 233, 0.7),
            rgba(0, 207, 165, 0.5),
            rgba(99, 102, 241, 0.6),
            rgba(236, 72, 153, 0.3),
            rgba(0, 207, 165, 0.5),
            rgba(14, 165, 233, 0.7)
          )`,
          filter: "blur(8px)",
          animation: `ronSwirl2 ${state === "speaking" ? "1.5s" : state === "listening" ? "2.5s" : "6s"} linear infinite`,
        }}
      />

      {/* Layer 3: Morphing blob core */}
      <div
        className="absolute rounded-full"
        style={{
          inset: "25%",
          background: `radial-gradient(
            ellipse at 35% 35%,
            rgba(0, 255, 200, 0.9),
            rgba(0, 207, 165, 0.7) 30%,
            rgba(14, 165, 233, 0.6) 60%,
            rgba(99, 102, 241, 0.4) 100%
          )`,
          filter: "blur(4px)",
          animation: `ronMorph ${state === "speaking" ? "1s" : "4s"} ease-in-out infinite`,
        }}
      />

      {/* Layer 4: Hot-white specular highlight */}
      <div
        className="absolute rounded-full"
        style={{
          inset: "35%",
          background: `radial-gradient(
            ellipse at 40% 30%,
            rgba(255, 255, 255, 0.7),
            rgba(200, 255, 240, 0.3) 40%,
            transparent 70%
          )`,
          animation: `ronSpecular 5s ease-in-out infinite`,
        }}
      />

      {/* Layer 5: Swirling tendrils overlay */}
      <div
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{ opacity: 0.4 }}
      >
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <div
            key={deg}
            className="absolute"
            style={{
              top: "50%",
              left: "50%",
              width: "120%",
              height: 2,
              transformOrigin: "0% 50%",
              background: `linear-gradient(
                90deg,
                transparent,
                rgba(0, 207, 165, 0.6) 30%,
                rgba(14, 165, 233, 0.4) 60%,
                transparent 100%
              )`,
              transform: `rotate(${deg}deg)`,
              filter: "blur(2px)",
              animation: `ronTendril ${state === "speaking" ? "1.5s" : "5s"} ease-in-out infinite`,
              animationDelay: `${(deg / 360) * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Listening ring indicator */}
      {isListening && (
        <div
          className="absolute rounded-full"
          style={{
            inset: "-10%",
            border: "2px solid rgba(0, 207, 165, 0.5)",
            animation: "ronListenRing 1.5s ease-out infinite",
          }}
        />
      )}

      {/* Thinking orbiting dots */}
      {isThinking && (
        <div className="absolute inset-0" style={{ animation: "ronSwirl1 2s linear infinite" }}>
          {[0, 90, 180, 270].map((deg) => (
            <div
              key={deg}
              className="absolute"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#F59E0B",
                boxShadow: "0 0 10px rgba(245, 158, 11, 0.6)",
                top: "50%",
                left: "50%",
                transform: `rotate(${deg}deg) translateX(110px) translateY(-3px)`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
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
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
        setOrbScale(1 + (avg / 255) * 0.5);
      } else {
        setOrbScale(1 + Math.sin(Date.now() / 200) * 0.15);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isSpeaking]);

  // Listening pulse
  useEffect(() => {
    if (!isListening) return;
    const pulse = () => {
      setOrbScale(1 + Math.sin(Date.now() / 300) * 0.08);
      animFrameRef.current = requestAnimationFrame(pulse);
    };
    pulse();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isListening]);

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
        body: JSON.stringify({ text: text.slice(0, 4000) }),
      });
      if (!resp.ok) throw new Error("TTS failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

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
          if (assistantText.trim()) playTTS(assistantText);
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
      if (transcript.trim()) sendMessage(transcript);
      setIsListening(false);
      setStatus("Ready");
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setStatus("Ready");
    };

    recognition.onend = () => setIsListening(false);

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
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center"
      style={{
        background: "radial-gradient(ellipse at 50% 30%, rgba(0,30,40,0.95), rgba(0,0,0,0.97))",
        backdropFilter: "blur(16px)",
        animation: "ronFadeIn 0.4s ease-out",
      }}
    >
      {/* Background effects */}
      <BackgroundParticles />

      {/* Ambient gradient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute rounded-full"
          style={{
            width: 500, height: 500, top: "-10%", left: "-10%",
            background: "radial-gradient(circle, rgba(0,207,165,0.06), transparent 70%)",
            animation: "ronAmbient1 12s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 600, height: 600, bottom: "-15%", right: "-15%",
            background: "radial-gradient(circle, rgba(99,102,241,0.05), transparent 70%)",
            animation: "ronAmbient2 15s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 400, height: 400, top: "30%", right: "5%",
            background: "radial-gradient(circle, rgba(14,165,233,0.04), transparent 70%)",
            animation: "ronAmbient3 10s ease-in-out infinite",
          }}
        />
      </div>

      {/* Header */}
      <div className="relative w-full flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ color: "#00CFA5", fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textShadow: "0 0 20px rgba(0,207,165,0.3)" }}>
          Talk to RON
        </span>
        <div className="flex gap-3">
          <button
            onClick={endConversation}
            title="End Conversation"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border-none cursor-pointer text-[13px] font-semibold transition-all duration-200"
            style={{
              background: "rgba(239,68,68,0.12)",
              color: "#EF4444",
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.25)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.12)"}
          >
            <PhoneOff size={15} /> End
          </button>
          <button
            onClick={endConversation}
            className="flex items-center justify-center w-9 h-9 rounded-lg border-none cursor-pointer transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", color: "#94A3B8" }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Orb + Conversation area */}
      <div className="relative flex-1 flex flex-col items-center w-full max-w-[640px] px-4 overflow-hidden">
        {/* Orb */}
        <div style={{ marginTop: messages.length > 0 ? 16 : 60, marginBottom: 12 }}>
          <PsychedelicOrb
            scale={orbScale}
            isListening={isListening}
            isThinking={isThinking}
            isSpeaking={isSpeaking}
          />
        </div>

        {/* Status */}
        <div
          className="text-[13px] font-semibold mb-4"
          style={{
            color: isListening ? "#00CFA5" : isThinking ? "#F59E0B" : isSpeaking ? "#0EA5E9" : "#64748B",
            fontFamily: "'DM Sans', sans-serif",
            textShadow: isListening ? "0 0 12px rgba(0,207,165,0.4)" : isSpeaking ? "0 0 12px rgba(14,165,233,0.4)" : "none",
          }}
        >
          {status}
        </div>

        {/* Chat messages */}
        <div ref={scrollRef} className="flex-1 w-full overflow-y-auto flex flex-col gap-3 pb-4">
          {messages.length === 0 && (
            <div className="text-center mt-6" style={{ color: "#64748B", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
              <p className="mb-2">Ask me anything about trading.</p>
              <p className="text-xs opacity-70">Tap the mic or type below to get started.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className="max-w-[85%] whitespace-pre-wrap break-words"
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                padding: "10px 16px",
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: msg.role === "user"
                  ? "linear-gradient(135deg, #00CFA5, #0EA5E9)"
                  : "rgba(255,255,255,0.06)",
                color: msg.role === "user" ? "#fff" : "#E2E8F0",
                fontSize: 14,
                lineHeight: 1.5,
                fontFamily: "'DM Sans', sans-serif",
                backdropFilter: msg.role === "assistant" ? "blur(8px)" : undefined,
                border: msg.role === "assistant" ? "1px solid rgba(255,255,255,0.05)" : undefined,
              }}
            >
              {msg.content}
              {i === messages.length - 1 && msg.role === "assistant" && isThinking && (
                <span style={{ opacity: 0.5 }}>▍</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="relative w-full max-w-[640px] px-6 pb-6 pt-4 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Mic button */}
        <button
          onClick={toggleMic}
          disabled={isThinking}
          className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-full border-none cursor-pointer transition-all duration-300"
          style={{
            background: isListening
              ? "linear-gradient(135deg, #EF4444, #DC2626)"
              : "linear-gradient(135deg, #00CFA5, #0EA5E9)",
            color: "#fff",
            boxShadow: isListening
              ? "0 0 30px rgba(239,68,68,0.5), 0 0 60px rgba(239,68,68,0.2)"
              : "0 0 30px rgba(0,207,165,0.4), 0 0 60px rgba(14,165,233,0.15)",
            opacity: isThinking ? 0.5 : 1,
          }}
        >
          {isListening ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        {/* Text input */}
        <div
          className="flex-1 flex items-center rounded-full px-1 pr-1 pl-[18px]"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(8px)",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") sendMessage(input); }}
            placeholder="Type a question..."
            disabled={isThinking}
            className="flex-1 bg-transparent border-none outline-none text-sm py-3.5"
            style={{ color: "#E2E8F0", fontFamily: "'DM Sans', sans-serif" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isThinking}
            className="flex items-center justify-center w-10 h-10 rounded-full border-none cursor-pointer transition-all duration-200"
            style={{
              background: input.trim() ? "#00CFA5" : "transparent",
              color: input.trim() ? "#fff" : "#475569",
            }}
          >
            {isThinking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>

      {/* ─── All keyframe animations ─── */}
      <style>{`
        @keyframes ronFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes ronSwirl1 {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes ronSwirl2 {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }

        @keyframes ronMorph {
          0%, 100% {
            border-radius: 50%;
            transform: scale(1) rotate(0deg);
          }
          25% {
            border-radius: 45% 55% 55% 45% / 55% 45% 55% 45%;
            transform: scale(1.05) rotate(5deg);
          }
          50% {
            border-radius: 55% 45% 45% 55% / 45% 55% 45% 55%;
            transform: scale(0.95) rotate(-5deg);
          }
          75% {
            border-radius: 48% 52% 52% 48% / 52% 48% 52% 48%;
            transform: scale(1.03) rotate(3deg);
          }
        }

        @keyframes ronSpecular {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
          33% { transform: translate(5%, -5%) scale(1.1); opacity: 0.7; }
          66% { transform: translate(-3%, 3%) scale(0.9); opacity: 0.4; }
        }

        @keyframes ronTendril {
          0%, 100% { opacity: 0.3; transform: rotate(var(--base-rot, 0deg)) scaleX(0.6); }
          50% { opacity: 0.6; transform: rotate(var(--base-rot, 0deg)) scaleX(1); }
        }

        @keyframes ronGlowPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }

        @keyframes ronListenRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }

        @keyframes ronParticleFloat {
          0% { transform: translate(0, 0) scale(1); opacity: 0.2; }
          50% { opacity: 0.5; }
          100% { transform: translate(${Math.random() > 0.5 ? '' : '-'}30px, -40px) scale(1.3); opacity: 0.1; }
        }

        @keyframes ronAmbient1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(50px, 30px) scale(1.2); }
        }

        @keyframes ronAmbient2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-40px, -20px) scale(1.15); }
        }

        @keyframes ronAmbient3 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
          50% { transform: translate(-30px, 40px) scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
