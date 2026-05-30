import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import LoungeProfileDialog from "./LoungeProfileDialog";
import LoungeProfilePrompt from "./LoungeProfilePrompt";

interface ChatMessage {
  id: string;
  userId: string;
  sender: string;
  text: string;
  timestamp: Date;
}

interface LoungeRow {
  id: string;
  user_id: string;
  display_name: string;
  text: string;
  created_at: string;
}

const MESSAGE_LIMIT = 100;
const LOUNGE_PROFILE_GATE_VERSION = "v2";
const getLoungeProfileGateKey = (uid: string) => `lounge-profile-ready:${LOUNGE_PROFILE_GATE_VERSION}:${uid}`;

const rowToMessage = (r: LoungeRow): ChatMessage => ({
  id: r.id,
  userId: r.user_id,
  sender: r.display_name,
  text: r.text,
  timestamp: new Date(r.created_at),
});

export default function LoungeChat() {
  const { profile, loading, userId, updateProfile, refetch } = useProfile();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [hasCompletedLoungeProfile, setHasCompletedLoungeProfile] = useState(false);
  const [gateLoaded, setGateLoaded] = useState(false);
  const [latestNews, setLatestNews] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!userId) { setHasCompletedLoungeProfile(false); setGateLoaded(true); return; }
    const savedState = window.localStorage.getItem(getLoungeProfileGateKey(userId)) === "1";
    setHasCompletedLoungeProfile(savedState);
    setGateLoaded(true);
  }, [loading, userId]);

  // Load chat history + subscribe to new messages in realtime.
  useEffect(() => {
    if (!userId) return;
    let active = true;

    (async () => {
      const { data } = await (supabase.from("lounge_messages" as any) as any)
        .select("id, user_id, display_name, text, created_at")
        .order("created_at", { ascending: false })
        .limit(MESSAGE_LIMIT);
      if (!active || !data) return;
      const ordered = (data as LoungeRow[]).slice().reverse().map(rowToMessage);
      setMessages(ordered);
    })();

    const channel = supabase
      .channel("lounge-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lounge_messages" },
        (payload: any) => {
          const msg = rowToMessage(payload.new as LoungeRow);
          setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
        },
      )
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [userId]);

  // Stream the latest market news headline into the room.
  useEffect(() => {
    if (!userId) return;
    let active = true;

    (async () => {
      const { data } = await supabase
        .from("news_items")
        .select("headline")
        .order("published_at", { ascending: false })
        .limit(1);
      if (active && data?.[0]?.headline) setLatestNews(data[0].headline as string);
    })();

    const channel = supabase
      .channel("lounge-news")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "news_items" },
        (payload: any) => {
          if (payload.new?.headline) setLatestNews(payload.new.headline as string);
        },
      )
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const isProfileComplete = hasCompletedLoungeProfile;
  const isChatLocked = loading || !gateLoaded || !userId || !isProfileComplete || sending;

  const displayName = profile?.show_nickname && profile?.nickname?.trim()
    ? profile.nickname.trim()
    : (profile?.full_name?.trim() || "You");

  const showPrompt = gateLoaded && !showProfileDialog && !isProfileComplete;

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isChatLocked || !userId) return;
    setSending(true);
    setInput("");
    const { data, error } = await (supabase.from("lounge_messages" as any) as any)
      .insert({ user_id: userId, display_name: displayName, text: trimmed.slice(0, 1000) })
      .select("id, user_id, display_name, text, created_at")
      .single();
    if (error) {
      // Restore the text so the user can retry.
      setInput(trimmed);
    } else if (data) {
      const msg = rowToMessage(data as LoungeRow);
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleProfileSave = async (data: {
    full_name: string; nickname: string; country: string | null;
    trading_preferences: string[]; favourite_sessions: string[]; show_nickname: boolean;
  }) => {
    await updateProfile({
      full_name: data.full_name,
      nickname: data.nickname || null,
      country: data.country,
      trading_preferences: data.trading_preferences,
      favourite_sessions: data.favourite_sessions,
      show_nickname: data.show_nickname,
    });
    if (userId) window.localStorage.setItem(getLoungeProfileGateKey(userId), "1");
    setHasCompletedLoungeProfile(true);
    setShowProfileDialog(false);
    await refetch();
  };

  const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: 340,
        display: "flex", flexDirection: "column",
        background: "hsl(0 0% 0% / 0.55)", backdropFilter: "blur(6px)",
        borderLeft: "1px solid hsl(0 0% 100% / 0.08)",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid hsl(0 0% 100% / 0.08)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: "hsl(32 52% 64%)", fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
            Lounge Chat
          </span>
          <button onClick={() => setShowProfileDialog(true)} style={{
            background: "none", border: "none", color: "hsl(32 52% 64% / 0.74)",
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            padding: "2px 6px", borderRadius: 4,
          }}>My Profile</button>
        </div>

        {/* Live news strip */}
        {latestNews && (
          <div style={{
            padding: "7px 16px", borderBottom: "1px solid hsl(0 0% 100% / 0.06)",
            background: "hsl(32 52% 64% / 0.07)", display: "flex", alignItems: "center", gap: 7,
            fontSize: 11, color: "hsl(0 0% 100% / 0.78)",
          }}>
            <span style={{ color: "hsl(32 52% 64%)", fontWeight: 700, flexShrink: 0 }}>📰 NEWS</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{latestNews}</span>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map(msg => {
            const isOwn = msg.userId === userId;
            return (
              <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: isOwn ? "hsl(32 52% 64%)" : "hsl(0 0% 100% / 0.6)", marginBottom: 2 }}>
                  {msg.sender}
                </span>
                <div style={{
                  maxWidth: "85%", padding: "8px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.45,
                  color: "hsl(0 0% 100%)",
                  background: isOwn ? "hsl(32 52% 64% / 0.2)" : "hsl(0 0% 100% / 0.08)",
                  border: isOwn ? "1px solid hsl(32 52% 64% / 0.25)" : "1px solid hsl(0 0% 100% / 0.06)",
                }}>{msg.text}</div>
                <span style={{ fontSize: 10, color: "hsl(0 0% 100% / 0.35)", marginTop: 2 }}>{formatTime(msg.timestamp)}</span>
              </div>
            );
          })}
          {messages.length === 0 && (
            <div style={{ color: "hsl(0 0% 100% / 0.4)", fontSize: 12, textAlign: "center", marginTop: 24 }}>
              No messages yet — start the conversation 🥃
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid hsl(0 0% 100% / 0.08)", position: "relative" }}>
          {gateLoaded && !isProfileComplete && (
            <div onClick={() => setShowProfileDialog(true)} style={{
              position: "absolute", inset: 0, background: "hsl(0 0% 0% / 0.72)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", zIndex: 2, borderTop: "1px solid hsl(32 52% 64% / 0.2)",
            }}>
              <span style={{ color: "hsl(32 52% 64%)", fontSize: 12, fontWeight: 600 }}>Complete your profile to start chatting</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Type a message…" disabled={isChatLocked}
              style={{
                flex: 1, background: "hsl(0 0% 100% / 0.06)", border: "1px solid hsl(0 0% 100% / 0.1)",
                borderRadius: 8, padding: "9px 14px", color: "hsl(0 0% 100%)", fontSize: 13,
                outline: "none", fontFamily: "'DM Sans', sans-serif",
              }}
            />
            <button onClick={handleSend} disabled={isChatLocked} style={{
              width: 36, height: 36, borderRadius: 8,
              background: input.trim() && !isChatLocked ? "hsl(32 52% 64% / 0.25)" : "hsl(0 0% 100% / 0.06)",
              border: "1px solid hsl(32 52% 64% / 0.3)",
              color: input.trim() && !isChatLocked ? "hsl(32 52% 64%)" : "hsl(0 0% 100% / 0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: input.trim() && !isChatLocked ? "pointer" : "default", transition: "all 0.2s",
            }}>
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
        currentCountry={profile?.country || null}
        currentTradingPreferences={profile?.trading_preferences || []}
        currentFavouriteSessions={profile?.favourite_sessions || []}
        currentShowNickname={profile?.show_nickname || false}
        onSave={handleProfileSave}
      />
    </>
  );
}
