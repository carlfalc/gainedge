import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BrokerHealth {
  isConnected: boolean;
  hasDefaultConnection: boolean;
  brokerName: string | null;
  status: string;
  balance: number | null;
  equity: number | null;
  lastHealthCheck: string | null;
  lastError: string | null;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FUNCTION_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/metaapi-trade`;

/**
 * Reads the user's default broker connection and exposes a health view +
 * an explicit testConnection() that calls metaapi-trade?action=test-connection
 * and persists the snapshot back to broker_connections.
 */
export function useBrokerHealth(userId: string | undefined | null) {
  const [health, setHealth] = useState<BrokerHealth>({
    isConnected: false,
    hasDefaultConnection: false,
    brokerName: null,
    status: "disconnected",
    balance: null,
    equity: null,
    lastHealthCheck: null,
    lastError: null,
  });
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("broker_connections")
      .select("broker_name,status,balance,equity,last_health_check,last_error")
      .eq("user_id", userId)
      .eq("is_default", true)
      .limit(1);
    const conn = data?.[0] as any;
    if (conn) {
      setHealth({
        isConnected: conn.status === "connected",
        hasDefaultConnection: true,
        brokerName: conn.broker_name ?? null,
        status: conn.status ?? "disconnected",
        balance: conn.balance ?? null,
        equity: conn.equity ?? null,
        lastHealthCheck: conn.last_health_check ?? null,
        lastError: conn.last_error ?? null,
      });
    } else {
      setHealth(h => ({ ...h, isConnected: false, hasDefaultConnection: false }));
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: any update to this user's broker_connections refreshes health
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`broker-health-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "broker_connections", filter: `user_id=eq.${userId}` },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, refresh]);

  const testConnection = useCallback(async (): Promise<{ ok: boolean; error?: string; balance?: number | null }> => {
    setTesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { ok: false, error: "Not authenticated" };
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "test-connection" }),
      });
      const data = await res.json();
      await refresh();
      return { ok: !!data.ok, error: data.error, balance: data.balance };
    } catch (e: any) {
      return { ok: false, error: e.message || "Test failed" };
    } finally {
      setTesting(false);
    }
  }, [refresh]);

  return { health, testing, testConnection, refresh };
}
