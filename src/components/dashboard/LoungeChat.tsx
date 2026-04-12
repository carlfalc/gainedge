import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import LoungeProfileDialog from "./LoungeProfileDialog";
import LoungeProfilePrompt from "./LoungeProfilePrompt";

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  isOwn: boolean;
}

const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    sender: "TraderMike",
    text: "Great session today, closed 3 winners on gold 🥃",
    timestamp: new Date(Date.now() - 300000),
    isOwn: false,
  },
  {
    id: "2",
    sender: "You",
    text: "Nice one! I caught that EURUSD reversal too",
    timestamp: new Date(Date.now() - 240000),
    isOwn: true,
  },
  {
    id: "3",
    sender: "SarahFX",
    text: "Cheers everyone, what a week 🎯",
    timestamp: new Date(Date.now() - 120000),
    isOwn: false,
  },
];

export default function LoungeChat() {
  const { profile, loading, userId, updateProfile, refetch } = useProfile();
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [input, setInput] = useState("");
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [hasCompletedLoungeProfile, setHasCompletedLoungeProfile] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) {
      setHasCompletedLoungeProfile(false);
      return;
    }

    const savedState = window.localStorage.getItem(`lounge-profile-ready:${userId}`) === "1";
    setHasCompletedLoungeProfile(savedState);
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const hasNickname = Boolean(profile?.nickname?.trim());
  const isProfileComplete = hasCompletedLoungeProfile || hasNickname;
  const isChatLocked = loading || !userId || !isProfileComplete;
  const displayName = profile?.nickname?.trim() || profile?.full_name?.trim() || "You";
  const showPrompt = !loading && Boolean(userId) && !isProfileComplete && !showProfileDialog;

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isChatLocked) return;

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: displayName,
        text: trimmed,
        timestamp: new Date(),
        isOwn: true,
      },
    ]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleProfileSave = async (fullName: string, nickname: string) => {
    await updateProfile({ full_name: fullName, nickname: nickname || null });

    if (userId) {
      window.localStorage.setItem(`lounge-profile-ready:${userId}`, "1");
    }

    setHasCompletedLoungeProfile(true);
    setShowProfileDialog(false);
    await refetch();
  };

  const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 340,
          display: "flex",
          flexDirection: "column",
          background: "hsl(0 0% 0% / 0.55)",
          backdropFilter: "blur(6px)",
          borderLeft: "1px solid hsl(0 0% 100% / 0.08)",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid hsl(0 0% 100% / 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              color: "hsl(32 52% 64%)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Lounge Chat
          </span>

          <button
            onClick={() => setShowProfileDialog(true)}
            style={{
              background: "none",
              border: "none",
              color: "hsl(32 52% 64% / 0.74)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            My Profile
          </button>
        </div>

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
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.isOwn ? "flex-end" : "flex-start",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: msg.isOwn ? "hsl(32 52% 64%)" : "hsl(0 0% 100% / 0.6)",
                  marginBottom: 2,
                }}
              >
                {msg.sender}
              </span>

              <div
                style={{
                  maxWidth: "85%",
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "hsl(0 0% 100%)",
                  background: msg.isOwn ? "hsl(32 52% 64% / 0.2)" : "hsl(0 0% 100% / 0.08)",
                  border: msg.isOwn
                    ? "1px solid hsl(32 52% 64% / 0.25)"
                    : "1px solid hsl(0 0% 100% / 0.06)",
                }}
              >
                {msg.text}
              </div>

              <span style={{ fontSize: 10, color: "hsl(0 0% 100% / 0.35)", marginTop: 2 }}>
                {formatTime(msg.timestamp)}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid hsl(0 0% 100% / 0.08)",
            position: "relative",
          }}
        >
          {!loading && !isProfileComplete && (
            <div
              onClick={() => setShowProfileDialog(true)}
              style={{
                position: "absolute",
                inset: 0,
                background: "hsl(0 0% 0% / 0.72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 2,
                borderTop: "1px solid hsl(32 52% 64% / 0.2)",
              }}
            >
              <span style={{ color: "hsl(32 52% 64%)", fontSize: 12, fontWeight: 600 }}>
                Complete your profile to start chatting
              </span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              disabled={isChatLocked}
              style={{
                flex: 1,
                background: "hsl(0 0% 100% / 0.06)",
                border: "1px solid hsl(0 0% 100% / 0.1)",
                borderRadius: 8,
                padding: "9px 14px",
                color: "hsl(0 0% 100%)",
                fontSize: 13,
                outline: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}
            />

            <button
              onClick={handleSend}
              disabled={isChatLocked}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: input.trim() && !isChatLocked ? "hsl(32 52% 64% / 0.25)" : "hsl(0 0% 100% / 0.06)",
                border: "1px solid hsl(32 52% 64% / 0.3)",
                color: input.trim() && !isChatLocked ? "hsl(32 52% 64%)" : "hsl(0 0% 100% / 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !isChatLocked ? "pointer" : "default",
                transition: "all 0.2s",
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      <LoungeProfilePrompt open={showPrompt} onComplete={() => setShowProfileDialog(true)} />

      <LoungeProfileDialog
        open={showProfileDialog}
        onClose={() => setShowProfileDialog(false)}
        currentName={profile?.full_name || null}
        currentNickname={profile?.nickname || null}
        onSave={handleProfileSave}
      />
    </>
  );
}
