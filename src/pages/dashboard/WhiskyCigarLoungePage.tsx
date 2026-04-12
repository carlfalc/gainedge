import { useRef, useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { Wine, ExternalLink, Volume2, VolumeX } from "lucide-react";
import LoungeChat from "@/components/dashboard/LoungeChat";

export default function WhiskyCigarLoungePage() {
  const isPopout = new URLSearchParams(window.location.search).get("popout") === "1";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [showUnmute, setShowUnmute] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    const p = v.play();
    if (p) {
      p.catch(() => {
        // Browser blocked unmuted autoplay — fall back to muted
        v.muted = true;
        setMuted(true);
        setShowUnmute(true);
        v.play();
      });
    }
  }, []);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted) setShowUnmute(false);
  };

  const handlePopOut = () => {
    window.open("/lounge-popout", "_blank", "noopener");
  };

  return (
    <div style={{ padding: 0, minHeight: isPopout ? "100vh" : undefined, background: "#000", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 24px" }}>
        <Wine size={28} style={{ color: "#D4A574" }} />
        <h1 style={{ color: C.text, fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>
          WHISKY & CIGAR LOUNGE
        </h1>
        {!isPopout && (
          <button
            onClick={handlePopOut}
            style={{
              marginLeft: "auto",
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              background: "#111724", border: "1px solid rgba(255,255,255,0.1)",
              color: "#D4A574", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#F5D5B0"; e.currentTarget.style.borderColor = "rgba(212,165,116,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#D4A574"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
          >
            <ExternalLink size={14} />
            <span>Pop Out</span>
          </button>
        )}
      </div>

      {/* Video */}
      <div style={{ flex: 1, position: "relative", background: "#000" }}>
        <video
          ref={videoRef}
          src="/videos/lounge-intro.mp4"
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />

        {/* Chat overlay */}
        <LoungeChat />

        {/* Unmute button — only shows if browser blocked audio */}
        {showUnmute && muted && (
          <button
            onClick={toggleMute}
            style={{
              position: "absolute", bottom: 24, right: 24,
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 18px", borderRadius: 10,
              background: "rgba(0,0,0,0.7)", border: "1px solid rgba(212,165,116,0.4)",
              color: "#D4A574", fontSize: 13, fontWeight: 600,
              cursor: "pointer", backdropFilter: "blur(8px)",
              transition: "all 0.2s",
            }}
          >
            <VolumeX size={18} />
            <span>Click to unmute</span>
          </button>
        )}
      </div>
    </div>
  );
}
