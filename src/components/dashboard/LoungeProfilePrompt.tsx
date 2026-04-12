import { Wine } from "lucide-react";

interface Props {
  open: boolean;
  onComplete: () => void;
}

export default function LoungeProfilePrompt({ open, onComplete }: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "hsl(0 0% 0% / 0.18)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          width: "min(440px, calc(100vw - 32px))",
          borderRadius: 20,
          border: "1px solid hsl(32 52% 64% / 0.32)",
          background: "linear-gradient(145deg, hsl(30 40% 10% / 0.9), hsl(0 0% 4% / 0.86))",
          boxShadow: "0 24px 80px hsl(0 0% 0% / 0.45)",
          padding: "28px 28px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Wine size={34} style={{ color: "hsl(32 52% 64%)" }} />

        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              margin: 0,
              color: "hsl(32 52% 64%)",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            WELCOME TO THE LOUNGE
          </h2>
          <p
            style={{
              margin: "12px 0 0",
              color: "hsl(0 0% 100% / 0.72)",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            Before you can join the lounge chat, please complete your profile.
          </p>
        </div>

        <button
          onClick={onComplete}
          style={{
            marginTop: 8,
            padding: "12px 24px",
            borderRadius: 10,
            border: "1px solid hsl(32 52% 64% / 0.38)",
            background: "hsl(32 52% 64% / 0.16)",
            color: "hsl(32 52% 64%)",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 0.3,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Complete My Profile
        </button>
      </div>
    </div>
  );
}
