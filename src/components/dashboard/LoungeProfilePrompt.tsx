import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Wine } from "lucide-react";

interface Props {
  open: boolean;
  onComplete: () => void;
}

export default function LoungeProfilePrompt({ open, onComplete }: Props) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        style={{
          background: "linear-gradient(145deg, #1a1208, #0d0a04)",
          border: "1px solid rgba(212,165,116,0.35)",
          color: "#fff",
          maxWidth: 400,
          textAlign: "center",
          padding: "32px 28px",
        }}
        // hide the X button — user must complete profile
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Wine size={36} style={{ color: "#D4A574" }} />
          <h2 style={{ color: "#D4A574", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
            WELCOME TO THE LOUNGE
          </h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 1.6 }}>
            Before you can chat with other traders, please complete your profile so everyone knows who you are.
          </p>
          <button
            onClick={onComplete}
            style={{
              marginTop: 8,
              padding: "12px 28px",
              borderRadius: 8,
              border: "1px solid rgba(212,165,116,0.4)",
              background: "rgba(212,165,116,0.2)",
              color: "#D4A574",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
            }}
          >
            Complete My Profile
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
