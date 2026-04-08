import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BROKERS = [
  "Eightcap", "IC Markets", "Pepperstone", "OANDA", "Forex.com",
  "Interactive Brokers", "Saxo Bank", "AvaTrade", "Plus500", "Capital.com",
  "XTB", "Fusion Markets", "FP Markets", "Vantage", "FXCM",
  "IG", "CMC Markets", "Admirals", "Tickmill", "ThinkMarkets",
];

interface BrokerModalProps {
  open: boolean;
  onClose: () => void;
  userId?: string;
}

export default function BrokerModal({ open, onClose, userId }: BrokerModalProps) {
  const [selected, setSelected] = useState("eightcap");

  useEffect(() => {
    if (!userId || !open) return;
    supabase.from("profiles").select("broker").eq("id", userId).single().then(({ data }) => {
      if (data?.broker) setSelected(data.broker);
    });
  }, [userId, open]);

  if (!open) return null;

  const handleSelect = async (broker: string) => {
    const key = broker.toLowerCase().replace(/[\s.]/g, "_");
    setSelected(key);
    if (userId) {
      await supabase.from("profiles").update({ broker: key }).eq("id", userId);
      toast.success(`Broker set to ${broker}`);
    }
  };

  const matchBroker = (name: string) => name.toLowerCase().replace(/[\s.]/g, "_") === selected;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
          padding: 28, width: 560, maxHeight: "85vh", overflowY: "auto",
          position: "relative",
        }}
      >
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 14, background: "none", border: "none",
          cursor: "pointer", color: C.muted,
        }}>
          <X size={18} />
        </button>

        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 4 }}>Select Your Broker</h2>
        <p style={{ fontSize: 13, color: C.sec, marginBottom: 20 }}>Your broker determines chart data and symbol mapping</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {BROKERS.map(name => {
            const active = matchBroker(name);
            return (
              <button
                key={name}
                onClick={() => handleSelect(name)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", borderRadius: 10, cursor: "pointer",
                  background: active ? C.jade + "14" : C.bg,
                  border: `1.5px solid ${active ? C.jade : C.border}`,
                  color: active ? C.jade : C.text,
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.15s",
                }}
              >
                <span>{name}</span>
                {active && <Check size={16} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
