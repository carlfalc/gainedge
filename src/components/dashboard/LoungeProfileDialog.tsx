import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  currentName: string | null;
  currentNickname: string | null;
  onSave: (fullName: string, nickname: string) => Promise<void>;
}

export default function LoungeProfileDialog({
  open,
  onClose,
  currentName,
  currentNickname,
  onSave,
}: Props) {
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setFullName(currentName && currentName !== "Trader" ? currentName : "");
    setNickname(currentNickname || "");
  }, [open, currentName, currentNickname]);

  if (!open) return null;

  const canSave = fullName.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;

    try {
      setSaving(true);
      await onSave(fullName.trim(), nickname.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 170,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "hsl(0 0% 0% / 0.3)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, calc(100vw - 32px))",
          borderRadius: 20,
          border: "1px solid hsl(32 52% 64% / 0.3)",
          background: "linear-gradient(145deg, hsl(30 40% 10% / 0.94), hsl(0 0% 4% / 0.9))",
          boxShadow: "0 24px 80px hsl(0 0% 0% / 0.5)",
          padding: 28,
          color: "hsl(0 0% 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: "hsl(32 52% 64%)",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              MY PROFILE
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                color: "hsl(0 0% 100% / 0.6)",
                fontSize: 13,
              }}
            >
              Add the details that will identify you in the lounge.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              border: "1px solid hsl(0 0% 100% / 0.12)",
              background: "hsl(0 0% 100% / 0.04)",
              color: "hsl(0 0% 100% / 0.72)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close profile dialog"
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "hsl(0 0% 100% / 0.66)",
              }}
            >
              Full Name <span style={{ color: "hsl(32 52% 64%)" }}>*</span>
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid hsl(32 52% 64% / 0.2)",
                background: "hsl(0 0% 100% / 0.05)",
                color: "hsl(0 0% 100%)",
                padding: "11px 14px",
                fontSize: 14,
                outline: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "hsl(0 0% 100% / 0.66)",
              }}
            >
              Nickname <span style={{ color: "hsl(0 0% 100% / 0.38)", fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="How people will see you in chat"
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid hsl(32 52% 64% / 0.2)",
                background: "hsl(0 0% 100% / 0.05)",
                color: "hsl(0 0% 100%)",
                padding: "11px 14px",
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
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid hsl(32 52% 64% / 0.38)",
              background: canSave ? "hsl(32 52% 64% / 0.16)" : "hsl(0 0% 100% / 0.04)",
              color: canSave ? "hsl(32 52% 64%)" : "hsl(0 0% 100% / 0.32)",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.3,
              cursor: canSave && !saving ? "pointer" : "default",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
