import { Brain, Mic } from "lucide-react";

interface AskRonButtonProps {
  onClick: () => void;
}

export default function AskRonButton({ onClick }: AskRonButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: 28,
        right: 28,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 22px",
        borderRadius: 50,
        border: "none",
        cursor: "pointer",
        background: "linear-gradient(135deg, #00CFA5 0%, #0EA5E9 100%)",
        color: "#fff",
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 0 24px rgba(0,207,165,0.4), 0 4px 16px rgba(0,0,0,0.3)",
        transition: "all 0.3s ease",
        animation: "ron-glow 3s ease-in-out infinite",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "scale(1.08)";
        e.currentTarget.style.boxShadow = "0 0 36px rgba(0,207,165,0.6), 0 6px 24px rgba(0,0,0,0.4)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 0 24px rgba(0,207,165,0.4), 0 4px 16px rgba(0,0,0,0.3)";
      }}
    >
      <Brain size={20} />
      <span>Ask RON</span>
      <Mic size={16} style={{ opacity: 0.8 }} />
      <style>{`
        @keyframes ron-glow {
          0%, 100% { box-shadow: 0 0 24px rgba(0,207,165,0.4), 0 4px 16px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 32px rgba(0,207,165,0.55), 0 4px 20px rgba(0,0,0,0.3); }
        }
      `}</style>
    </button>
  );
}
