import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";

export interface ChartOrderLinesProps {
  visible: boolean;
  orderMode: "market" | "limit" | "stop";
  entry: number | null;
  sl: number | null;
  tp: number | null;
  priceToY: (price: number) => number | null;
  yToPrice: (y: number) => number | null;
  priceDec?: number;
  onEntryDrag: (price: number) => void;
  onSLDrag: (price: number) => void;
  onTPDrag: (price: number) => void;
  onSLRemove: () => void;
  onTPRemove: () => void;
}

type LineType = "entry" | "sl" | "tp";

const LINE_STYLES: Record<LineType, { color: string; label: string }> = {
  entry: { color: "#FFFFFF", label: "Entry" },
  sl: { color: "#EF4444", label: "SL" },
  tp: { color: "#22C55E", label: "TP" },
};

export default function ChartOrderLines({
  visible, orderMode, entry, sl, tp,
  priceToY, yToPrice, priceDec = 2,
  onEntryDrag, onSLDrag, onTPDrag, onSLRemove, onTPRemove,
}: ChartOrderLinesProps) {
  const [dragging, setDragging] = useState<LineType | null>(null);
  const [dragPrice, setDragPrice] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const price = yToPrice(y);
      if (price === null || price <= 0) return;
      setDragPrice(price);
      if (dragging === "entry") onEntryDrag(price);
      else if (dragging === "sl") onSLDrag(price);
      else onTPDrag(price);
    };
    const handleUp = () => {
      setDragging(null);
      setDragPrice(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, yToPrice, onEntryDrag, onSLDrag, onTPDrag]);

  if (!visible) return null;

  const lines: { type: LineType; price: number; removable: boolean; onRemove?: () => void }[] = [];

  if (orderMode !== "market" && entry !== null) {
    lines.push({ type: "entry", price: dragging === "entry" && dragPrice !== null ? dragPrice : entry, removable: false });
  }
  if (sl !== null) {
    lines.push({ type: "sl", price: dragging === "sl" && dragPrice !== null ? dragPrice : sl, removable: true, onRemove: onSLRemove });
  }
  if (tp !== null) {
    lines.push({ type: "tp", price: dragging === "tp" && dragPrice !== null ? dragPrice : tp, removable: true, onRemove: onTPRemove });
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0"
      style={{ pointerEvents: dragging ? "auto" : "none", zIndex: 10 }}
    >
      {lines.map(({ type, price, removable, onRemove }) => {
        const y = priceToY(price);
        if (y === null || !isFinite(y)) return null;
        const cfg = LINE_STYLES[type];
        return (
          <div
            key={type}
            className="absolute left-0 right-0 group"
            style={{ top: y, transform: "translateY(-50%)", pointerEvents: "none" }}
          >
            {/* Dashed line */}
            <div
              className="w-full h-px opacity-60"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, ${cfg.color} 0, ${cfg.color} 6px, transparent 6px, transparent 12px)`,
              }}
            />
            {/* Drag handle (invisible wider strip for easy grabbing) */}
            <div
              className="absolute left-0 right-16 h-4 -top-2"
              style={{ cursor: dragging === type ? "grabbing" : "ns-resize", pointerEvents: "auto" }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragging(type);
                setDragPrice(price);
              }}
            />
            {/* Price label */}
            <div
              className="absolute right-1 -top-3 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold select-none whitespace-nowrap"
              style={{
                backgroundColor: `${cfg.color}20`,
                color: cfg.color,
                borderLeft: `2px solid ${cfg.color}`,
                pointerEvents: "auto",
              }}
            >
              {cfg.label}: {price.toFixed(priceDec)}
              {removable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove?.();
                  }}
                  className="ml-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: `${cfg.color}30` }}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
