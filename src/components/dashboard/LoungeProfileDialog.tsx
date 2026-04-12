import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  currentName: string | null;
  currentNickname: string | null;
  onSave: (fullName: string, nickname: string) => Promise<void>;
}

export default function LoungeProfileDialog({ open, onClose, currentName, currentNickname, onSave }: Props) {
  const [fullName, setFullName] = useState(currentName || "");
  const [nickname, setNickname] = useState(currentNickname || "");
  const [saving, setSaving] = useState(false);

  const canSave = fullName.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await onSave(fullName.trim(), nickname.trim());
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        style={{
          background: "linear-gradient(145deg, #1a1208, #0d0a04)",
          border: "1px solid rgba(212,165,116,0.3)",
          color: "#fff",
          maxWidth: 420,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "#D4A574", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
            MY PROFILE
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600, marginBottom: 4, display: "block" }}>
              Full Name <span style={{ color: "#D4A574" }}>*</span>
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(212,165,116,0.25)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#fff",
                fontSize: 14,
                outline: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600, marginBottom: 4, display: "block" }}>
              Nickname <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="How others will see you in chat"
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(212,165,116,0.25)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#fff",
                fontSize: 14,
                outline: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              marginTop: 4,
              padding: "11px 0",
              borderRadius: 8,
              border: "1px solid rgba(212,165,116,0.4)",
              background: canSave ? "rgba(212,165,116,0.2)" : "rgba(255,255,255,0.04)",
              color: canSave ? "#D4A574" : "rgba(255,255,255,0.3)",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              cursor: canSave ? "pointer" : "default",
              fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
            }}
          >
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
