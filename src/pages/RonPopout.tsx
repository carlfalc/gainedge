import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, PhoneOff, Send, Loader2, X } from "lucide-react";
import ronBg from "@/assets/ron-holographic-bg.png";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ron-chat`;
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ron-tts`;

interface Ctx {
  page?: string;
  instrument?: string;
  timeframe?: string;
  pattern?: string;
  price?: string;
  sessionLabel?: string;
  userName?: string;
  userId?: string;
}

async function streamChat(
  messages: Msg[],
  context: Ctx,
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
      } catch { /* ignore */ }
    }
  }
  onDone();
}

export default function RonPopout() {
  // Read context from query string
  const params = new URLSearchParams(window.location.search);
  const context: Ctx = {
    page: params.get("page") || undefined,
    instrument: params.get("instrument") || undefined,
    timeframe: params.get("timeframe") || undefined,
    sessionLabel: params.get("sessionLabel") || undefined,
    userName: params.get("userName") || undefined,
    userId: params.get("userId") || undefined,
  };

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState<string>("Ready");
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);

  // ─── Sentence-level TTS queue ───
  const ttsQueueRef = useRef<string[]>([]);
  const ttsPlayingRef = useRef(false);
  const ttsBufferRef = useRef("");

  // ─── Audio analyser for voice-reactive background ───
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceMapRef = useRef<WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>>(new WeakMap());
  const rafRef = useRef<number | null>(null);
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    document.title = "Talk to RON";
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const speakWithBrowser = useCallback((text: string, onEnd?: () => void) => {
    try {
      if (!("speechSynthesis" in window)) { onEnd?.(); return; }
      const utter = new SpeechSynthesisUtterance(text.slice(0, 4000));
      utter.rate = 1.18;
      utter.onend = () => onEnd?.();
      utter.onerror = () => onEnd?.();
      window.speechSynthesis.speak(utter);
    } catch { onEnd?.(); }
  }, []);

  // Attach Web Audio analyser to an <audio> element and start RAF loop
  const attachAnalyser = useCallback((audio: HTMLAudioElement) => {
    try {
      if (!audioCtxRef.current) {
        const Ctx: typeof AudioContext =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      if (!analyserRef.current) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
      }

      // Each <audio> can only be sourced once — cache to avoid InvalidStateError
      let source = sourceMapRef.current.get(audio);
      if (!source) {
        source = ctx.createMediaElementSource(audio);
        source.connect(analyserRef.current!);
        sourceMapRef.current.set(audio, source);
      }

      // Start RAF loop if not already running
      if (rafRef.current == null) {
        const data = new Uint8Array(analyserRef.current!.frequencyBinCount);
        let smoothed = 0;
        const tick = () => {
          const a = analyserRef.current;
          if (!a) { rafRef.current = null; return; }
          a.getByteFrequencyData(data);
          // Voice band (roughly 80Hz-3kHz) → first ~30 bins at 44.1kHz/256
          let sum = 0;
          const end = Math.min(40, data.length);
          for (let i = 2; i < end; i++) sum += data[i];
          const avg = sum / (end - 2) / 255; // 0..1
          // Boost & clamp
          const boosted = Math.min(1, avg * 1.6);
          smoothed = smoothed * 0.65 + boosted * 0.35;
          setAmplitude(smoothed);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch (e) {
      console.warn("Analyser attach failed (non-fatal):", e);
    }
  }, []);

  // Decay amplitude to 0 when not speaking; stop RAF when idle
  useEffect(() => {
    if (!isSpeaking && amplitude > 0.001) {
      const id = setTimeout(() => setAmplitude((a) => a * 0.5), 80);
      return () => clearTimeout(id);
    }
    if (!isSpeaking && rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setAmplitude(0);
    }
  }, [isSpeaking, amplitude]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const playNextInQueue = useCallback(async () => {
    if (ttsPlayingRef.current) return;
    const next = ttsQueueRef.current.shift();
    if (!next) {
      setIsSpeaking(false);
      setStatus("Ready");
      return;
    }
    ttsPlayingRef.current = true;
    setIsSpeaking(true);
    setStatus("RON is speaking...");

    const finish = () => {
      ttsPlayingRef.current = false;
      playNextInQueue();
    };

    try {
      const resp = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text: next.slice(0, 4000) }),
      });

      const contentType = resp.headers.get("content-type") || "";
      if (!resp.ok || contentType.includes("application/json")) {
        speakWithBrowser(next, finish);
        return;
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.crossOrigin = "anonymous";
      audio.playbackRate = 1.1;
      audioRef.current = audio;
      attachAnalyser(audio);
      audio.onended = () => { URL.revokeObjectURL(url); finish(); };
      audio.onerror = () => { URL.revokeObjectURL(url); finish(); };
      await audio.play();
    } catch (e) {
      console.error("TTS error:", e);
      speakWithBrowser(next, finish);
    }
  }, [speakWithBrowser]);

  const enqueueTTS = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    ttsQueueRef.current.push(trimmed);
    playNextInQueue();
  }, [playNextInQueue]);

  // Flush completed sentences from buffer to TTS queue
  const flushSentences = useCallback((final: boolean) => {
    const buf = ttsBufferRef.current;
    if (!buf) return;
    const re = /[^.!?\n]+[.!?\n]+/g;
    let match: RegExpExecArray | null;
    let lastIdx = 0;
    const sentences: string[] = [];
    while ((match = re.exec(buf)) !== null) {
      sentences.push(match[0]);
      lastIdx = match.index + match[0].length;
    }
    ttsBufferRef.current = buf.slice(lastIdx);
    for (const s of sentences) {
      const clean = s.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim();
      if (clean.length >= 2) enqueueTTS(clean);
    }
    if (final && ttsBufferRef.current.trim()) {
      const tail = ttsBufferRef.current.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim();
      if (tail) enqueueTTS(tail);
      ttsBufferRef.current = "";
    }
  }, [enqueueTTS]);

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

    // Reset TTS state for new turn
    ttsBufferRef.current = "";
    ttsQueueRef.current = [];
    window.speechSynthesis?.cancel();

    try {
      await streamChat(
        newMessages,
        context,
        (chunk) => {
          assistantText += chunk;
          ttsBufferRef.current += chunk;
          flushSentences(false);
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
          flushSentences(true);
        },
        abort.signal
      );
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages(prev => [...prev, { role: "assistant", content: `Sorry, error: ${e.message}` }]);
      }
      setIsThinking(false);
      setStatus("Ready");
    }
  }, [messages, isThinking, context, flushSentences]);

  const toggleMic = useCallback(async () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setStatus("Ready");
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setStatus("Speech recognition not supported");
      return;
    }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) sendMessage(transcript);
      setIsListening(false);
      setStatus("Ready");
    };
    recognition.onerror = () => { setIsListening(false); setStatus("Ready"); };
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
    window.speechSynthesis?.cancel();
    window.close();
  }, []);

  const intensity = isSpeaking ? 1.5 : isListening ? 1.25 : isThinking ? 1.15 : 1.05;
  const animSpeed = isSpeaking ? "3s" : isListening ? "5s" : "7s";
  const spinSpeed = isSpeaking ? "12s" : isListening ? "18s" : "28s";
  const pulseSpeed = isSpeaking ? "1.8s" : isListening ? "2.5s" : "4s";

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: "#000", fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* ─── Holographic animated background ─── */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Primary spinning layer */}
        <div
          className="absolute"
          style={{
            inset: "-25%",
            backgroundImage: `url(${ronBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: `saturate(1.4) brightness(${0.9 + (intensity - 1) * 0.5})`,
            animation: `ronHoloSpin ${spinSpeed} linear infinite, ronHoloPulse ${pulseSpeed} ease-in-out infinite`,
            transformOrigin: "center center",
          }}
        />
        {/* Secondary counter-spinning mirrored layer */}
        <div
          className="absolute"
          style={{
            inset: "-25%",
            backgroundImage: `url(${ronBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            mixBlendMode: "screen",
            opacity: 0.55,
            animation: `ronHoloSpinReverse ${spinSpeed} linear infinite, ronHoloDrift ${animSpeed} ease-in-out infinite alternate`,
            transformOrigin: "center center",
          }}
        />
        {/* Third flowing layer with hue shift */}
        <div
          className="absolute"
          style={{
            inset: "-30%",
            backgroundImage: `url(${ronBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            mixBlendMode: "color-dodge",
            opacity: 0.35,
            animation: `ronHoloFlow ${animSpeed} ease-in-out infinite, ronHoloHue ${spinSpeed} linear infinite`,
            transformOrigin: "center center",
          }}
        />
        {/* Color shift overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(0,0,0,0.55) 100%)",
            animation: `ronVignettePulse ${pulseSpeed} ease-in-out infinite`,
          }}
        />
        {/* Bottom dark gradient for chat legibility */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: "55%",
            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)",
          }}
        />
        {/* Top dark gradient */}
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: "20%",
            background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)",
          }}
        />
      </div>

      {/* ─── Header overlay ─── */}
      <header
        className="relative z-10 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: isSpeaking ? "#0EA5E9" : isListening ? "#00CFA5" : isThinking ? "#F59E0B" : "#64748B",
              boxShadow: `0 0 12px currentColor`,
              animation: (isSpeaking || isListening || isThinking) ? "ronStatusPulse 1.2s ease-in-out infinite" : undefined,
            }}
          />
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Talk to RON
          </span>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginLeft: 8 }}>
            {status}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={endConversation}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border-none cursor-pointer text-[12px] font-semibold transition-all"
            style={{ background: "rgba(239,68,68,0.18)", color: "#FCA5A5", backdropFilter: "blur(8px)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.32)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.18)")}
          >
            <PhoneOff size={13} /> End
          </button>
          <button
            onClick={() => window.close()}
            className="flex items-center justify-center w-9 h-9 rounded-full border-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.08)", color: "#fff", backdropFilter: "blur(8px)" }}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* ─── Chat overlay (main content) ─── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-end overflow-hidden">
        <div
          ref={scrollRef}
          className="w-full max-w-[760px] flex-1 overflow-y-auto flex flex-col gap-3 px-6 pb-4 pt-8"
          style={{ scrollbarWidth: "thin" }}
        >
          {messages.length === 0 && (
            <div
              className="text-center mx-auto px-6 py-4 rounded-2xl"
              style={{
                color: "#fff",
                fontSize: 15,
                background: "rgba(0,0,0,0.35)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.08)",
                marginTop: "auto",
              }}
            >
              <p className="mb-1" style={{ fontWeight: 600 }}>Ask me anything about trading.</p>
              <p style={{ fontSize: 12, opacity: 0.7 }}>Tap the mic or type a question below.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className="max-w-[85%] whitespace-pre-wrap break-words"
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                padding: "12px 18px",
                borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background: msg.role === "user"
                  ? "linear-gradient(135deg, rgba(0,207,165,0.95), rgba(14,165,233,0.95))"
                  : "rgba(15,23,42,0.7)",
                color: "#fff",
                fontSize: 14,
                lineHeight: 1.55,
                backdropFilter: "blur(14px)",
                border: msg.role === "assistant" ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.15)",
                boxShadow: msg.role === "user"
                  ? "0 4px 20px rgba(0,207,165,0.3)"
                  : "0 4px 20px rgba(0,0,0,0.4)",
              }}
            >
              {msg.content}
              {i === messages.length - 1 && msg.role === "assistant" && isThinking && (
                <span style={{ opacity: 0.5 }}>▍</span>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* ─── Bottom controls overlay ─── */}
      <footer
        className="relative z-10 px-6 pb-6 pt-4 flex items-center gap-3 mx-auto w-full max-w-[760px]"
        style={{ backdropFilter: "blur(8px)" }}
      >
        <button
          onClick={toggleMic}
          disabled={isThinking}
          className="flex-shrink-0 flex items-center justify-center rounded-full border-none cursor-pointer transition-all duration-300"
          style={{
            width: 56, height: 56,
            background: isListening
              ? "linear-gradient(135deg, #EF4444, #DC2626)"
              : "linear-gradient(135deg, #00CFA5, #0EA5E9)",
            color: "#fff",
            boxShadow: isListening
              ? "0 0 32px rgba(239,68,68,0.6)"
              : "0 0 32px rgba(0,207,165,0.5)",
            opacity: isThinking ? 0.5 : 1,
            animation: isListening ? "ronMicPulse 1.4s ease-in-out infinite" : undefined,
          }}
        >
          {isListening ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        <div
          className="flex-1 flex items-center rounded-full px-1 pr-1 pl-[18px]"
          style={{
            background: "rgba(15,23,42,0.7)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(14px)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
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
            style={{ color: "#fff" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isThinking}
            className="flex items-center justify-center w-10 h-10 rounded-full border-none cursor-pointer transition-all"
            style={{
              background: input.trim() ? "#00CFA5" : "transparent",
              color: input.trim() ? "#fff" : "#475569",
            }}
          >
            {isThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </footer>

      <style>{`
        @keyframes ronHoloSpin {
          0% { transform: rotate(0deg) scale(1.1); }
          100% { transform: rotate(360deg) scale(1.1); }
        }
        @keyframes ronHoloSpinReverse {
          0% { transform: rotate(360deg) scaleX(-1) scale(1.05); }
          100% { transform: rotate(0deg) scaleX(-1) scale(1.05); }
        }
        @keyframes ronHoloPulse {
          0%, 100% { transform: scale(1.1); filter: saturate(1.4) brightness(0.95); }
          50% { transform: scale(1.22); filter: saturate(1.8) brightness(1.15); }
        }
        @keyframes ronHoloDrift {
          0% { transform: scaleX(-1) scale(1.05) translate(-3%, 2%); }
          50% { transform: scaleX(-1) scale(1.15) translate(3%, -2%) rotate(2deg); }
          100% { transform: scaleX(-1) scale(1.08) translate(-2%, 3%) rotate(-2deg); }
        }
        @keyframes ronHoloFlow {
          0% { transform: scale(1.1) translate(0, 0) rotate(0deg); }
          25% { transform: scale(1.18) translate(4%, -3%) rotate(3deg); }
          50% { transform: scale(1.12) translate(-3%, 4%) rotate(-2deg); }
          75% { transform: scale(1.2) translate(2%, 3%) rotate(4deg); }
          100% { transform: scale(1.1) translate(0, 0) rotate(0deg); }
        }
        @keyframes ronHoloHue {
          0% { filter: hue-rotate(0deg) saturate(1.5); }
          50% { filter: hue-rotate(40deg) saturate(2); }
          100% { filter: hue-rotate(0deg) saturate(1.5); }
        }
        @keyframes ronVignettePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
        @keyframes ronStatusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes ronMicPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
