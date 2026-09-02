import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import BrokerMappingsAdmin from "@/components/dashboard/BrokerMappingsAdmin";

type AppRole = "admin" | "moderator" | "user";

interface RoleRow {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export default function AdminPage() {
  const { isAdmin, loading } = useAdmin();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("admin");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("id,user_id,role,created_at")
      .order("created_at");
    setRoles((data as RoleRow[]) ?? []);
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const grant = async () => {
    if (!newUserId.trim()) return;
    setWorking(true);
    const { error } = await supabase.from("user_roles").insert({ user_id: newUserId.trim(), role: newRole });
    setWorking(false);
    if (error) { toast.error(error.message); return; }
    setNewUserId("");
    toast.success("Role granted");
    load();
  };

  const revoke = async (row: RoleRow) => {
    const { error } = await supabase.from("user_roles").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Role revoked");
    load();
  };

  if (loading) {
    return <div style={{ padding: 24, color: C.sec, fontFamily: "'DM Sans', sans-serif" }}>Checking permissions…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Admin only</h1>
        <p style={{ color: C.sec, fontSize: 15 }}>
          This area requires the admin role on your signed-in account.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 1100 }}>
      <h1 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 24, fontWeight: 800, marginBottom: 6 }}>
        <ShieldCheck size={20} color={C.jade} /> Admin
      </h1>
      <p style={{ color: C.sec, fontSize: 15, marginBottom: 20 }}>
        Role management and broker symbol mappings. Roles are stored server-side and enforced by database policies.
      </p>

      <section style={section}>
        <h2 style={heading}><UserPlus size={15} /> User roles</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <input
            value={newUserId}
            onChange={event => setNewUserId(event.target.value)}
            placeholder="User ID (uuid)"
            style={{ ...input, flex: "1 1 320px" }}
          />
          <select value={newRole} onChange={event => setNewRole(event.target.value as AppRole)} style={{ ...input, width: 150 }}>
            <option value="admin">admin</option>
            <option value="moderator">moderator</option>
            <option value="user">user</option>
          </select>
          <button onClick={grant} disabled={working} style={primaryButton}>Grant role</button>
        </div>

        {roles.length === 0 ? (
          <p style={{ color: C.sec, fontSize: 14 }}>No roles assigned yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: C.sec, textAlign: "left" }}>
                <th style={cell}>User ID</th><th style={cell}>Role</th><th style={cell}>Granted</th><th style={cell} />
              </tr>
            </thead>
            <tbody>
              {roles.map(row => (
                <tr key={row.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...cell, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{row.user_id}</td>
                  <td style={{ ...cell, color: row.role === "admin" ? C.jade : C.text }}>{row.role}</td>
                  <td style={{ ...cell, color: C.sec }}>{new Date(row.created_at).toLocaleDateString()}</td>
                  <td style={{ ...cell, textAlign: "right" }}>
                    <button onClick={() => revoke(row)} style={ghostButton}><Trash2 size={13} /> Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={section}>
        <BrokerMappingsAdmin />
      </section>
    </div>
  );
}

const section: React.CSSProperties = { padding: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16 };
const heading: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, color: C.jade, fontSize: 15, marginBottom: 13 };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 7, background: C.bg2, border: `1px solid ${C.border}`, color: C.text };
const cell: React.CSSProperties = { padding: "8px 6px" };
const primaryButton: React.CSSProperties = { padding: "9px 13px", borderRadius: 7, border: "none", background: C.jade, color: "#020617", fontWeight: 800, cursor: "pointer" };
const ghostButton: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.red, cursor: "pointer", fontSize: 13 };
