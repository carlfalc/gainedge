import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  isOwn: boolean;
}

const MOCK_MESSAGES: ChatMessage[] = [
  { id: "1", sender: "TraderMike", text: "Great session today, closed 3 winners on gold 🥃", timestamp: new Date(Date.now() - 300000), isOwn: false },
  { id: "2", sender: "You", text: "Nice one! I caught that EURUSD reversal too", timestamp: new Date(Date.now() - 240000), isOwn: true },
  { id: "3", sender: "SarahFX", text: "Cheers everyone, what a week 🎯", timestamp: new Date(Date.now() - 120000), isOwn: false },
];

export default function LoungeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), sender: "You", text: trimmed, timestamp: new Date(), isOwn: true },
    ]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 340,
        display: "flex",
        flexDirection: "column",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Chat header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          color: "#D4A574",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        Lounge Chat
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.isOwn ? "flex-end" : "flex-start" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: msg.isOwn ? "#D4A574" : "rgba(255,255,255,0.6)", marginBottom: 2 }}>
              {msg.sender}
            </span>
            <div
              style={{
                maxWidth: "85%",
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.45,
                color: "#fff",
                background: msg.isOwn ? "rgba(212,165,116,0.2)" : "rgba(255,255,255,0.08)",
                border: msg.isOwn ? "1px solid rgba(212,165,116,0.25)" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {msg.text}
            </div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: "10px 12px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "9px 14px",
            color: "#fff",
            fontSize: 13,
            outline: "none",
            fontFamily: "'DM Sans', sans-serif",
          }}
        />
        <button
          onClick={handleSend}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: input.trim() ? "rgba(212,165,116,0.25)" : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(212,165,116,0.3)",
            color: input.trim() ? "#D4A574" : "rgba(255,255,255,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: input.trim() ? "pointer" : "default",
            transition: "all 0.2s",
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
