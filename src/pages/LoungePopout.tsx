import { useEffect } from "react";
import { X } from "lucide-react";

export default function LoungePopout() {
  useEffect(() => {
    document.title = "GAINEDGE — Whisky & Cigar Lounge";
  }, []);

  return (
    <div className="fixed inset-0 bg-[#0B0F1A] flex flex-col">
      {/* Banner */}
      <div className="h-9 flex items-center justify-between px-4 bg-[#111724] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold">
            <span className="text-white">G</span>
            <span className="text-[#00CFA5]">AI</span>
            <span className="text-white">NEDGE</span>
          </span>
          <span className="text-white/40 text-[12px]">—</span>
          <span className="text-[#D4A574] text-[12px] font-medium">Whisky & Cigar Lounge</span>
          <span className="text-white/30 text-[11px] ml-2">Drag this tab to another screen</span>
        </div>
        <button
          onClick={() => window.close()}
          className="text-white/40 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1">
        <iframe
          src="/dashboard/whisky-cigar-lounge?popout=1"
          className="w-full h-full border-0"
          title="Whisky & Cigar Lounge"
        />
      </div>
    </div>
  );
}
