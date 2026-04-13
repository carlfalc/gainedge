import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { Mail, Lock, X } from "lucide-react";
import { useTranslation } from "react-i18next";

const C = {
  bg: "#080B12", card: "#111724", border: "rgba(255,255,255,0.06)",
  jade: "#00CFA5", text: "#E4E9F0", sec: "#8892A4", muted: "#555F73",
};

const Login = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate("/dashboard");
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    else navigate("/dashboard");
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/login",
    });
    if (result.error) toast.error("Google sign-in failed");
    if (!result.redirected && !result.error) navigate("/dashboard");
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px 11px 42px", borderRadius: 10,
    border: `1px solid ${C.border}`, background: C.bg, color: C.text,
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 36, width: 400, maxWidth: "90vw" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 28, textDecoration: "none" }}>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>
            <span style={{ color: C.text }}>G</span>
            <span style={{ color: C.jade }}>AI</span>
            <span style={{ color: C.text }}>NEDGE</span>
          </span>
        </Link>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, textAlign: "center", marginBottom: 4 }}>{t("auth.welcomeBack")}</h1>
        <p style={{ fontSize: 13, color: C.sec, textAlign: "center", marginBottom: 24 }}>{t("auth.loginSubtitle")}</p>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ position: "relative" }}>
            <Mail size={16} color={C.muted} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
            <input type="email" placeholder={t("auth.emailPlaceholder")} value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle}
              onFocus={e => e.target.style.borderColor = C.jade + "60"} onBlur={e => e.target.style.borderColor = C.border} />
          </div>
          <div style={{ position: "relative" }}>
            <Lock size={16} color={C.muted} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
            <input type="password" placeholder={t("auth.passwordPlaceholder")} value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle}
              onFocus={e => e.target.style.borderColor = C.jade + "60"} onBlur={e => e.target.style.borderColor = C.border} />
          </div>

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: C.jade, color: "#080B12", fontSize: 14, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.7 : 1,
          }}>
            {loading ? t("auth.signingIn") : t("auth.login")}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontSize: 12, color: C.muted }}>{t("auth.orContinueWith")}</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          <button type="button" onClick={handleGoogleLogin} style={{
            width: "100%", padding: "11px 0", borderRadius: 10, cursor: "pointer",
            background: "transparent", border: `1px solid ${C.border}`, color: C.text,
            fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 13, color: C.sec, marginTop: 20 }}>
          {t("auth.noAccount")}{" "}
          <Link to="/signup" style={{ color: C.jade, fontWeight: 600, textDecoration: "none" }}>{t("auth.signUp")}</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
