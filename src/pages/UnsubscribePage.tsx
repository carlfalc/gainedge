import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Status = "loading" | "valid" | "already" | "invalid" | "success" | "error";

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    fetch(`${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`, {
      headers: { apikey: anonKey },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.valid === false && d.reason === "already_unsubscribed") setStatus("already");
        else if (d.valid) setStatus("valid");
        else setStatus("invalid");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    try {
      const { data } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
      if (data?.success) setStatus("success");
      else if (data?.reason === "already_unsubscribed") setStatus("already");
      else setStatus("error");
    } catch { setStatus("error"); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#080B12", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 420, width: "100%", padding: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e8eaed", marginBottom: 16 }}>
          {status === "success" ? "You've been unsubscribed" :
           status === "already" ? "Already unsubscribed" :
           status === "invalid" ? "Invalid link" :
           status === "error" ? "Something went wrong" :
           "Email Preferences"}
        </h1>
        <p style={{ fontSize: 14, color: "#8b8fa3", marginBottom: 24 }}>
          {status === "loading" && "Verifying your request..."}
          {status === "valid" && "Click below to unsubscribe from GainEdge email notifications."}
          {status === "success" && "You will no longer receive email notifications from GainEdge."}
          {status === "already" && "You were already unsubscribed from these emails."}
          {status === "invalid" && "This unsubscribe link is invalid or has expired."}
          {status === "error" && "Please try again later or contact support."}
        </p>
        {status === "valid" && (
          <button
            onClick={handleUnsubscribe}
            style={{ background: "#00CFA5", color: "#080B12", border: "none", borderRadius: 8, padding: "12px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Confirm Unsubscribe
          </button>
        )}
      </div>
    </div>
  );
}
