import { useState } from "react";
import {
  TrendingUp, Minus, ArrowRight, Hash,
  Pentagon, Square, Triangle, Circle,
  Type, MessageSquare, Ruler,
  ChevronDown, X, Trash2, MousePointer,
} from "lucide-react";

export interface DrawingToolDef {
  id: string;
  name: string;
  category: string;
}

const TOOL_CATEGORIES: Record<string, { icon: React.ReactNode; label: string; tools: DrawingToolDef[] }> = {
  line: {
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    label: "Lines",
    tools: [
      { id: "trend_line", name: "Trend Line", category: "line" },
      { id: "horizontal_line", name: "Horizontal Line", category: "line" },
      { id: "vertical_line", name: "Vertical Line", category: "line" },
      { id: "ray", name: "Ray", category: "line" },
      { id: "arrow", name: "Arrow", category: "line" },
      { id: "extended_line", name: "Extended Line", category: "line" },
      { id: "cross_line", name: "Cross Line", category: "line" },
      { id: "info_line", name: "Info Line", category: "line" },
      { id: "trend_angle", name: "Trend Angle", category: "line" },
      { id: "horizontal_ray", name: "Horizontal Ray", category: "line" },
    ],
  },
  fibonacci: {
    icon: <Hash className="w-3.5 h-3.5" />,
    label: "Fibonacci",
    tools: [
      { id: "fib_retracement", name: "Fib Retracement", category: "fibonacci" },
      { id: "fib_extension", name: "Fib Extension", category: "fibonacci" },
      { id: "fib_channel", name: "Fib Channel", category: "fibonacci" },
      { id: "fib_time_zone", name: "Fib Time Zone", category: "fibonacci" },
      { id: "fib_speed_fan", name: "Fib Speed Fan", category: "fibonacci" },
      { id: "fib_circles", name: "Fib Circles", category: "fibonacci" },
      { id: "fib_spiral", name: "Fib Spiral", category: "fibonacci" },
      { id: "fib_arcs", name: "Fib Arcs", category: "fibonacci" },
      { id: "fib_wedge", name: "Fib Wedge", category: "fibonacci" },
      { id: "pitchfan", name: "Pitchfan", category: "fibonacci" },
      { id: "trend_fib_time", name: "Trend-Based Fib Time", category: "fibonacci" },
    ],
  },
  channel: {
    icon: <ArrowRight className="w-3.5 h-3.5" />,
    label: "Channels",
    tools: [
      { id: "parallel_channel", name: "Parallel Channel", category: "channel" },
      { id: "regression_trend", name: "Regression Trend", category: "channel" },
      { id: "flat_top_bottom", name: "Flat Top/Bottom", category: "channel" },
      { id: "disjoint_channel", name: "Disjoint Channel", category: "channel" },
    ],
  },
  pitchfork: {
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    label: "Pitchfork",
    tools: [
      { id: "andrews_pitchfork", name: "Andrews' Pitchfork", category: "pitchfork" },
      { id: "schiff_pitchfork", name: "Schiff Pitchfork", category: "pitchfork" },
      { id: "modified_schiff", name: "Modified Schiff", category: "pitchfork" },
      { id: "inside_pitchfork", name: "Inside Pitchfork", category: "pitchfork" },
    ],
  },
  gann: {
    icon: <Pentagon className="w-3.5 h-3.5" />,
    label: "Gann",
    tools: [
      { id: "gann_box", name: "Gann Box", category: "gann" },
      { id: "gann_fan", name: "Gann Fan", category: "gann" },
      { id: "gann_square_fixed", name: "Gann Square Fixed", category: "gann" },
      { id: "gann_square", name: "Gann Square", category: "gann" },
    ],
  },
  shape: {
    icon: <Square className="w-3.5 h-3.5" />,
    label: "Shapes",
    tools: [
      { id: "rectangle", name: "Rectangle", category: "shape" },
      { id: "circle", name: "Circle", category: "shape" },
      { id: "triangle", name: "Triangle", category: "shape" },
      { id: "ellipse", name: "Ellipse", category: "shape" },
      { id: "arc", name: "Arc", category: "shape" },
      { id: "price_range", name: "Price Range", category: "shape" },
      { id: "rotated_rectangle", name: "Rotated Rectangle", category: "shape" },
      { id: "path", name: "Path", category: "shape" },
      { id: "polyline", name: "Polyline", category: "shape" },
      { id: "curve", name: "Curve", category: "shape" },
      { id: "double_curve", name: "Double Curve", category: "shape" },
    ],
  },
  annotation: {
    icon: <Type className="w-3.5 h-3.5" />,
    label: "Annotations",
    tools: [
      { id: "text", name: "Text", category: "annotation" },
      { id: "callout", name: "Callout", category: "annotation" },
      { id: "anchored_text", name: "Anchored Text", category: "annotation" },
      { id: "note", name: "Note", category: "annotation" },
      { id: "price_note", name: "Price Note", category: "annotation" },
      { id: "price_label", name: "Price Label", category: "annotation" },
      { id: "arrow_marker", name: "Arrow Marker", category: "annotation" },
      { id: "flag_mark", name: "Flag Mark", category: "annotation" },
      { id: "comment", name: "Comment", category: "annotation" },
    ],
  },
  forecasting: {
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    label: "Forecast",
    tools: [
      { id: "long_position", name: "Long Position", category: "forecasting" },
      { id: "short_position", name: "Short Position", category: "forecasting" },
      { id: "projection", name: "Projection", category: "forecasting" },
      { id: "forecast", name: "Forecast", category: "forecasting" },
      { id: "bars_pattern", name: "Bars Pattern", category: "forecasting" },
    ],
  },
  measurement: {
    icon: <Ruler className="w-3.5 h-3.5" />,
    label: "Measure",
    tools: [
      { id: "date_range", name: "Date Range", category: "measurement" },
      { id: "date_price_range", name: "Date & Price Range", category: "measurement" },
    ],
  },
};

interface Props {
  activeTool: string | null;
  onSelectTool: (toolId: string | null) => void;
  onClearAll: () => void;
  drawingCount: number;
}

export default function DrawingToolbar({ activeTool, onSelectTool, onClearAll, drawingCount }: Props) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-0.5 bg-[#111724] border border-white/[0.06] rounded-lg p-1 w-9">
      {/* Pointer / Select */}
      <button
        onClick={() => onSelectTool(null)}
        className={`p-1.5 rounded transition-all ${
          !activeTool ? "bg-[#00CFA5]/15 text-[#00CFA5]" : "text-white/40 hover:text-white hover:bg-white/5"
        }`}
        title="Select"
      >
        <MousePointer className="w-3.5 h-3.5" />
      </button>

      <div className="w-full h-px bg-white/5 my-0.5" />

      {/* Tool categories */}
      {Object.entries(TOOL_CATEGORIES).map(([catKey, cat]) => (
        <div key={catKey} className="relative">
          <button
            onClick={() => setExpandedCat(expandedCat === catKey ? null : catKey)}
            className={`p-1.5 rounded transition-all w-full flex items-center justify-center ${
              activeTool && cat.tools.some(t => t.id === activeTool)
                ? "bg-[#00CFA5]/15 text-[#00CFA5]"
                : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
            title={cat.label}
          >
            {cat.icon}
          </button>

          {/* Flyout */}
          {expandedCat === catKey && (
            <div
              className="absolute left-full top-0 ml-1 bg-[#111724] border border-white/10 rounded-lg p-1.5 z-50 min-w-[160px] shadow-xl"
              onMouseLeave={() => setExpandedCat(null)}
            >
              <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wider px-2 py-1">
                {cat.label}
              </div>
              {cat.tools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => {
                    onSelectTool(tool.id);
                    setExpandedCat(null);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-all ${
                    activeTool === tool.id
                      ? "bg-[#00CFA5]/10 text-[#00CFA5]"
                      : "text-white/50 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {tool.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="w-full h-px bg-white/5 my-0.5" />

      {/* Clear all */}
      {drawingCount > 0 && (
        <button
          onClick={onClearAll}
          className="p-1.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
          title={`Clear all drawings (${drawingCount})`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export { TOOL_CATEGORIES };
