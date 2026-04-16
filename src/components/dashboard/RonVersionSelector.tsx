import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Brain, X, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

type RonVersion = "v1_legacy" | "v2_knowledge";

interface RonVersionSelectorProps {
  userId: string | undefined;
  onVersionChange?: (version: RonVersion) => void;
}

const WELCOME_KEY = "ron_version_welcome_dismissed";

export default function RonVersionSelector({ userId, onVersionChange }: RonVersionSelectorProps) {
  const [activeVersion, setActiveVersion] = useState<RonVersion>("v1_legacy");
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
          const v = data.signal_engine === "v2_knowledge" ? "v2_knowledge" : "v1_legacy";
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
          You can explore V2 Knowledge Base (experimental) anytime, but V1 is recommended while you get familiar with the platform.
        </div>
      )}

      {/* Active rules label */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase" style={{ color: "#00CFA5" }}>
          <CheckCircle2 size={11} />
          {activeVersion === "v1_legacy" ? "V1 Rules Currently Applied" : "V2 Rules Currently Applied"}
        </div>
      </div>

      {/* Version cards */}
      <div className="p-3 space-y-2">
        <TooltipProvider delayDuration={300}>
          {/* V1 Legacy */}
          <VersionCard
            active={activeVersion === "v1_legacy"}
            onClick={() => handleSwitch("v1_legacy")}
            icon={<Sparkles size={activeVersion === "v1_legacy" ? 16 : 13} />}
            title="RON V1 Legacy"
            subtitle="Premium Trading Vision"
            emoji="✨"
            description={
              "Our proven flagship strategy with consistent high-probability signals. Historical win rate: 82% across 2,600+ backtested trades. Refined over years of live market analysis. Uses confluence of multiple confirmations before firing a signal."
            }
            badge="RECOMMENDED for all traders"
            badgeStyle="success"
          />

          {/* V2 Knowledge Base */}
          <VersionCard
            active={activeVersion === "v2_knowledge"}
            onClick={() => handleSwitch("v2_knowledge")}
            icon={<Brain size={activeVersion === "v2_knowledge" ? 16 : 13} />}
            title="RON V2 Knowledge Base"
            subtitle="Experimental"
            emoji="🧠"
            description={
              "Advanced AI model incorporating Smart Money Concepts, institutional order flow, and live market structure. Currently in active development with a ~50% win rate during training phase. This model continuously improves as more data flows through the platform — results WILL get better over time as RON learns."
            }
            badge="Use with caution. Best for experienced traders"
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
          className="w-full text-left rounded-lg p-3 transition-all duration-300 relative overflow-hidden"
          style={{
            transform: active ? "scale(1)" : "scale(0.95)",
            opacity: active ? 1 : 0.6,
            border: active ? "1.5px solid rgba(0,207,165,0.5)" : "1px solid hsl(var(--border))",
            background: active
              ? "linear-gradient(135deg, rgba(0,207,165,0.08) 0%, rgba(14,165,233,0.05) 100%)"
              : "hsl(var(--background) / 0.3)",
            boxShadow: active ? "0 0 16px rgba(0,207,165,0.15), inset 0 1px 0 rgba(0,207,165,0.1)" : "none",
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
                <span className={`font-bold tracking-wide ${active ? "text-[12px] text-foreground" : "text-[11px] text-muted-foreground"}`}>
                  {emoji} {title}
                </span>
                <span className={`text-[9px] font-medium ${active ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                  — {subtitle}
                </span>
              </div>
              <p className={`mt-1.5 leading-relaxed ${active ? "text-[10px] text-muted-foreground" : "text-[9px] text-muted-foreground/70"}`}>
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
      {!active && (
        <TooltipContent side="left" className="text-xs">
          Click to switch to {title}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

export type { RonVersion };
