import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Server-validated admin check. The role lives in `public.user_roles` and is
 * verified through the security-definer `has_role` function — never from
 * localStorage or a client-side list.
 */
export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) { setIsAdmin(false); setLoading(false); }
        return;
      }
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!cancelled) { setIsAdmin(data === true); setLoading(false); }
    };

    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { check(); });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  return { isAdmin, loading };
}
