/**
 * GAINEDGE_UI_DEDUPE_NAV_V1 — sidebar navigation grouping.
 *
 * Presentation-only data structure. Paths, labels and styling flags are carried
 * over verbatim from the previous flat NAV_ITEMS list: no route is added,
 * removed, renamed or redirected here.
 */
import {
  LayoutDashboard, Zap, BookOpen, BarChart3, RefreshCw, Calendar,
  Settings, Lightbulb, Clock, Newspaper, Globe, CandlestickChart,
  Wine, Brain, ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  /** i18n key when it contains a dot, otherwise a literal label. */
  labelKey: string;
  icon: LucideIcon;
  path: string;
  gold?: boolean;
  white?: boolean;
}

export interface NavGroup {
  /** i18n key when it contains a dot, otherwise a literal label. */
  labelKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "Workspace",
    items: [
      { labelKey: "nav.dashboard", icon: LayoutDashboard, path: "/dashboard" },
      { labelKey: "nav.charts", icon: CandlestickChart, path: "/dashboard/charts", gold: true },
      { labelKey: "nav.signals", icon: Zap, path: "/dashboard/signals" },
      { labelKey: "nav.strategy", icon: Zap, path: "/dashboard/strategy", gold: true },
    ],
  },
  {
    labelKey: "RON",
    items: [
      { labelKey: "Ask RON", icon: Brain, path: "/dashboard/ai", gold: true },
      { labelKey: "RON Decision", icon: ShieldCheck, path: "/dashboard/ron-decision" },
    ],
  },
  {
    labelKey: "Review",
    items: [
      { labelKey: "nav.journal", icon: BookOpen, path: "/dashboard/journal" },
      { labelKey: "nav.analytics", icon: BarChart3, path: "/dashboard/analytics" },
      { labelKey: "nav.insights", icon: Lightbulb, path: "/dashboard/insights" },
      { labelKey: "nav.backtesting", icon: RefreshCw, path: "/dashboard/backtesting" },
      { labelKey: "nav.calendar", icon: Calendar, path: "/dashboard/calendar" },
      { labelKey: "nav.myNews", icon: Globe, path: "/dashboard/my-news" },
    ],
  },
  {
    labelKey: "Settings",
    items: [
      { labelKey: "nav.settings", icon: Settings, path: "/dashboard/settings" },
      { labelKey: "nav.clockSettings", icon: Clock, path: "/dashboard/clock-settings" },
      { labelKey: "nav.newsSettings", icon: Newspaper, path: "/dashboard/news-settings" },
    ],
  },
  {
    labelKey: "Extras",
    items: [
      { labelKey: "nav.lounge", icon: Wine, path: "/dashboard/whisky-cigar-lounge", gold: true },
    ],
  },
];

/** Flat list of every navigable path, in render order. */
export const NAV_PATHS: string[] = NAV_GROUPS.flatMap(g => g.items.map(i => i.path));
