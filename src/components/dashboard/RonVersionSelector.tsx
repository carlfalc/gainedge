import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Brain, Layers, X, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type RonVersion = "v1" | "v2" | "v1v2";

interface RonVersionSelectorProps {
  userId: string | undefined;
  onVersionChange?: (version: RonVersion) => void;
}

const WELCOME_KEY = "ron_version_welcome_dismissed";

// Map any value (including legacy) → canonical RonVersion
function normalizeVersion(value: string | null | undefined): RonVersion {
  if (value === "v2" || value === "v2_knowledge") return "v2";
  if (value === "v1v2") return "v1v2";
  return "v1"; // default + v1_legacy fallback
}

const VERSION_LABELS: Record<RonVersion, string> = {
  v1: "V1 Rules Currently Applied",
  v2: "V2 Rules Currently Applied",
  v1v2: "V1 + V2 Combined Rules Applied",
};

export default function RonVersionSelector({ userId, onVersionChange }: RonVersionSelectorProps) {
  const [activeVersion, setActiveVersion] = useState<RonVersion>("v1");
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(WELCOME_KEY)) {
      setShowWelcome(true);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_signal_preferences")
      .select("signal_engine")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.signal_engine) {
          const v = normalizeVersion(data.signal_engine);
          setActiveVersion(v);
          onVersionChange?.(v);
        }
      });
  }, [userId]);

  const handleSwitch = async (version: RonVersion) => {
    if (version === activeVersion || !userId) return;
    setActiveVersion(version);
    onVersionChange?.(version);
    await supabase
      .from("user_signal_preferences")
      .upsert({ user_id: userId, signal_engine: version }, { onConflict: "user_id" });
  };

  const dismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem(WELCOME_KEY, "1");
  };

  return (
    <div className="border-b border-border">
      {/* Welcome banner */}
      {showWelcome && (
        <div className="mx-3 mt-3 p-2.5 rounded-lg border text-[10px] leading-relaxed text-muted-foreground relative"
          style={{ background: "rgba(0,207,165,0.06)", borderColor: "rgba(0,207,165,0.2)" }}>
          <button onClick={dismissWelcome} className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
          <span className="text-foreground font-semibold">Welcome!</span> We've set you up with RON V1 Legacy — our proven premium strategy.
          You can explore V2 Knowledge Base (experimental) or run them combined anytime, but V1 is recommended while you get familiar with the platform.
        </div>
      )}

      {/* Active rules label */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase" style={{ color: "#00CFA5" }}>
          <CheckCircle2 size={11} />
          {VERSION_LABELS[activeVersion]}
        </div>
      </div>

      {/* Version cards */}
      <div className="p-3 space-y-2">
        <TooltipProvider delayDuration={300}>
          {/* V1 Legacy */}
          <VersionCard
            active={activeVersion === "v1"}
            onClick={() => handleSwitch("v1")}
            icon={<Sparkles size={activeVersion === "v1" ? 16 : 13} />}
            title="RON V1 Legacy Enhanced"
            subtitle="EMA 4/17 + 1H Trend + Sessions"
            emoji="✨"
            description={
              "Falconer Pine Script port: EMA(4)/EMA(17) crossover on closed 15m candles, 1H trend alignment, user-toggleable sessions. Risk: 55-pip SL / 100-pip TP (1:1.82 R:R). One open position per symbol. Honest 90-day backtests with conservative SL-first intrabar resolution — actual performance shown live, no inflated claims."
            }
            badge="RECOMMENDED for all traders"
            badgeStyle="success"
          />

          {/* V2 Knowledge Base */}
          <VersionCard
            active={activeVersion === "v2"}
            onClick={() => handleSwitch("v2")}
            icon={<Brain size={activeVersion === "v2" ? 16 : 13} />}
            title="RON V2 Knowledge Base"
            subtitle="Experimental"
            emoji="🧠"
            description={
              "Advanced AI model incorporating Smart Money Concepts, institutional order flow, and live market structure. Currently in active development with a ~50% win rate during training phase. This model continuously improves as more data flows through the platform — results WILL get better over time as RON learns."
            }
            badge="Use with caution. Best for experienced traders"
            badgeStyle="warning"
          />

          {/* V1 + V2 Combined */}
          <VersionCard
            active={activeVersion === "v1v2"}
            onClick={() => handleSwitch("v1v2")}
            icon={<Layers size={activeVersion === "v1v2" ? 16 : 13} />}
            title="RON V1 + V2 Combined"
            subtitle="Hybrid Engine"
            emoji="⚡"
            description={
              "Runs both engines in parallel and surfaces signals from each. Use this to compare V1's proven setups against V2's experimental Smart Money signals side-by-side. Best for traders who want maximum coverage and are comfortable filtering signals manually."
            }
            badge="Maximum signal coverage"
            badgeStyle="warning"
          />
        </TooltipProvider>
      </div>
    </div>
  );
}

function VersionCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
  emoji,
  description,
  badge,
  badgeStyle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  emoji: string;
  description: string;
  badge: string;
  badgeStyle: "success" | "warning";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`w-full text-left rounded-lg transition-all duration-300 relative overflow-hidden ${active ? "p-4" : "p-2.5"}`}
          style={{
            opacity: active ? 1 : 0.6,
            border: active ? "2px solid rgba(0,207,165,0.6)" : "1px solid hsl(var(--border))",
            background: active
              ? "linear-gradient(135deg, rgba(0,207,165,0.1) 0%, rgba(14,165,233,0.08) 100%)"
              : "hsl(var(--background) / 0.3)",
            boxShadow: active ? "0 0 20px rgba(0,207,165,0.2), 0 0 40px rgba(0,207,165,0.08), inset 0 1px 0 rgba(0,207,165,0.15)" : "none",
          }}
        >
          {/* Active badge */}
          {active && (
            <div className="absolute top-2 right-2">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider"
                style={{
                  background: "rgba(0,207,165,0.15)",
                  color: "#00CFA5",
                  border: "1px solid rgba(0,207,165,0.3)",
                  animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#00CFA5" }} />
                ACTIVE
              </span>
            </div>
          )}

          <div className="flex items-start gap-2">
            <div
              className="shrink-0 mt-0.5 transition-all"
              style={{ color: active ? "#00CFA5" : "hsl(var(--muted-foreground))" }}
            >
              {icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`font-bold tracking-wide ${active ? "text-[13px] text-foreground" : "text-[10px] text-muted-foreground"}`}>
                  {emoji} {title}
                </span>
                <span className={`font-medium ${active ? "text-[10px] text-muted-foreground" : "text-[8px] text-muted-foreground/60"}`}>
                  — {subtitle}
                </span>
              </div>
              <p className={`mt-1.5 leading-relaxed ${active ? "text-[10px] text-muted-foreground" : "text-[9px] text-muted-foreground/60 line-clamp-2"}`}>
                {description}
              </p>
              <div className="mt-2">
                <span
                  className="inline-block text-[8px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{
                    background: badgeStyle === "success" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
                    color: badgeStyle === "success" ? "#4ADE80" : "#F59E0B",
                    border: `1px solid ${badgeStyle === "success" ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
                  }}
                >
                  {badge}
                </span>
              </div>
            </div>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className={`text-xs ${active ? "hidden" : ""}`}>
        Click to switch to {title}
      </TooltipContent>
    </Tooltip>
  );
}

export type { RonVersion };
