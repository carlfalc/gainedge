import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock } from "lucide-react";

const C = {
  bg: "#080B12", card: "#111724", border: "rgba(255,255,255,0.06)",
  jade: "#00CFA5", text: "#E4E9F0", sec: "#FFFFFF", muted: "#FFFFFF",
};

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setReady(true); });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error("Use at least 8 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password set — you can now sign in with email and password");
    navigate("/dashboard");
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px 11px 42px", borderRadius: 10,
    border: `1px solid ${C.border}`, background: C.bg, color: C.text,
    fontSize: 16, fontFamily: "'DM Sans', sans-serif", outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 36, width: 400, maxWidth: "90vw" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, textAlign: "center", marginBottom: 6 }}>Set a new password</h1>
        <p style={{ fontSize: 15, color: C.sec, textAlign: "center", marginBottom: 22 }}>
          {ready ? "Choose the password you'll use to sign in." : "Open this page from the reset link in your email, or sign in first."}
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ position: "relative" }}>
            <Lock size={16} color={C.muted} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
            <input type="password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ position: "relative" }}>
            <Lock size={16} color={C.muted} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
            <input type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={inputStyle} />
          </div>
          <button type="submit" disabled={loading || !ready} style={{
            width: "100%", padding: "12px 0", borderRadius: 10, border: "none", cursor: ready ? "pointer" : "not-allowed",
            background: C.jade, color: "#080B12", fontSize: 16, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif", opacity: loading || !ready ? 0.6 : 1,
          }}>
            {loading ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
