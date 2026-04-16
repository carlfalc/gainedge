import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BrokerAvailabilityDotProps {
  status: "available" | "unavailable" | "unverified" | "no_broker";
  brokerName?: string | null;
  symbol: string;
}

const COLORS: Record<string, string> = {
  available: "#22C55E",
  unavailable: "#EF4444",
  unverified: "#EAB308",
  no_broker: "#6B7280",
};

const TOOLTIPS: Record<string, (sym: string, broker?: string | null) => string> = {
  available: (_sym, _broker) => "Auto-trade enabled",
  unavailable: (sym, broker) => `Your broker${broker ? ` [${broker}]` : ""} doesn't offer ${sym}. Auto-trade will skip signals for this instrument.`,
  unverified: (sym) => `${sym} mapping needs verification`,
  no_broker: () => "No broker connected yet",
};

export default function BrokerAvailabilityDot({ status, brokerName, symbol }: BrokerAvailabilityDotProps) {
  const color = COLORS[status];
  const tooltip = TOOLTIPS[status](symbol, brokerName);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: color,
              display: "inline-block",
              flexShrink: 0,
              boxShadow: `0 0 4px ${color}60`,
            }}
          />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[240px] text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
