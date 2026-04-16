import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BrokerMapping {
  id: string;
  broker: string;
  canonical_symbol: string;
  broker_symbol: string;
  contract_size: number;
  pip_value: number;
  min_lot_size: number;
  is_available: boolean;
  last_verified: string | null;
}

export interface BrokerConnection {
  id: string;
  broker_name: string;
  is_default: boolean;
  status: string;
}

/**
 * Hook to fetch broker symbol mappings and user's default broker connection.
 * Provides availability checks and broker-specific symbol resolution.
 */
export function useBrokerMappings(userId: string | undefined) {
  const [mappings, setMappings] = useState<BrokerMapping[]>([]);
  const [defaultBroker, setDefaultBroker] = useState<string | null>(null);
  const [defaultConnection, setDefaultConnection] = useState<BrokerConnection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    const load = async () => {
      const [mappingsRes, connRes] = await Promise.all([
        supabase.from("broker_symbol_mappings").select("*"),
        supabase.from("broker_connections").select("id, broker_name, is_default, status").eq("user_id", userId).eq("is_default", true).limit(1),
      ]);

      if (mappingsRes.data) setMappings(mappingsRes.data as unknown as BrokerMapping[]);

      const conn = connRes.data?.[0] as unknown as BrokerConnection | undefined;
      if (conn) {
        setDefaultConnection(conn);
        // Normalise broker name to lowercase key used in mappings table
        setDefaultBroker(conn.broker_name.toLowerCase().replace(/\s+/g, ""));
      }
      setLoading(false);
    };

    load();
  }, [userId]);

  /** Normalise broker display name to mapping key */
  const normaliseBroker = useCallback((name: string) => {
    const map: Record<string, string> = {
      eightcap: "eightcap",
      "ic markets": "icmarkets",
      icmarkets: "icmarkets",
      oanda: "oanda",
      pepperstone: "pepperstone",
      fxcm: "fxcm",
    };
    return map[name.toLowerCase()] || name.toLowerCase().replace(/\s+/g, "");
  }, []);

  /** Check if a canonical symbol is available on user's default broker */
  const isAvailable = useCallback(
    (canonicalSymbol: string, brokerOverride?: string): boolean | null => {
      const bk = brokerOverride ? normaliseBroker(brokerOverride) : defaultBroker;
      if (!bk) return null; // no broker connected
      const m = mappings.find(
        (m) => m.broker === bk && m.canonical_symbol === canonicalSymbol
      );
      if (!m) return null; // no mapping found
      return m.is_available;
    },
    [mappings, defaultBroker, normaliseBroker]
  );

  /** Get broker-specific symbol for execution */
  const getBrokerSymbol = useCallback(
    (canonicalSymbol: string, brokerOverride?: string): string | null => {
      const bk = brokerOverride ? normaliseBroker(brokerOverride) : defaultBroker;
      if (!bk) return null;
      const m = mappings.find(
        (m) => m.broker === bk && m.canonical_symbol === canonicalSymbol
      );
      return m?.broker_symbol ?? null;
    },
    [mappings, defaultBroker, normaliseBroker]
  );

  /** Get full mapping for a symbol on a broker */
  const getMapping = useCallback(
    (canonicalSymbol: string, brokerOverride?: string): BrokerMapping | null => {
      const bk = brokerOverride ? normaliseBroker(brokerOverride) : defaultBroker;
      if (!bk) return null;
      return mappings.find(
        (m) => m.broker === bk && m.canonical_symbol === canonicalSymbol
      ) ?? null;
    },
    [mappings, defaultBroker, normaliseBroker]
  );

  /** Get availability status for display: 'available' | 'unavailable' | 'unverified' | 'no_broker' */
  const getAvailabilityStatus = useCallback(
    (canonicalSymbol: string, brokerOverride?: string): "available" | "unavailable" | "unverified" | "no_broker" => {
      const bk = brokerOverride ? normaliseBroker(brokerOverride) : defaultBroker;
      if (!bk) return "no_broker";
      const m = mappings.find(
        (m) => m.broker === bk && m.canonical_symbol === canonicalSymbol
      );
      if (!m) return "unverified";
      return m.is_available ? "available" : "unavailable";
    },
    [mappings, defaultBroker, normaliseBroker]
  );

  /** Get all mappings for a specific broker */
  const getMappingsForBroker = useCallback(
    (brokerName: string) => {
      const bk = normaliseBroker(brokerName);
      return mappings.filter((m) => m.broker === bk);
    },
    [mappings, normaliseBroker]
  );

  /** Count available/unavailable instruments for a broker */
  const getAvailabilitySummary = useCallback(
    (symbols: string[], brokerOverride?: string) => {
      const bk = brokerOverride ? normaliseBroker(brokerOverride) : defaultBroker;
      if (!bk) return { available: 0, unavailable: 0, unverified: symbols.length, broker: null };
      let available = 0, unavailable = 0, unverified = 0;
      const unavailableSymbols: string[] = [];
      for (const sym of symbols) {
        const m = mappings.find((m) => m.broker === bk && m.canonical_symbol === sym);
        if (!m) { unverified++; }
        else if (m.is_available) { available++; }
        else { unavailable++; unavailableSymbols.push(sym); }
      }
      return { available, unavailable, unverified, unavailableSymbols, broker: bk };
    },
    [mappings, defaultBroker, normaliseBroker]
  );

  return {
    mappings,
    defaultBroker,
    defaultConnection,
    loading,
    isAvailable,
    getBrokerSymbol,
    getMapping,
    getAvailabilityStatus,
    getMappingsForBroker,
    getAvailabilitySummary,
    normaliseBroker,
  };
}
