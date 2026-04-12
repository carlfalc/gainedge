

## Plan: Move Buy/Sell Insights Inline with Session Row

### What Changes
Move the green "Best BUY" and red "Best SHORT" insight text from a separate line underneath each session to be **inline on the same row**, appearing after the volume/LIVE badge data. This applies consistently to Asian, London, and New York sessions.

### Layout Change
```text
BEFORE:
│ Asian  [NAS100] ⏰ 11:00 AM – 12:00 PM  164,221 vol  LIVE │
│   ▲ Best BUY: NAS100 @ 1:00 PM (55%)  ▼ Best SHORT: ...   │

AFTER:
│ Asian  [NAS100] ⏰ 11:00 AM – 12:00 PM  164,221 vol  LIVE  ▲ Best BUY: NAS100 @ 1:00 PM (55%)  ▼ Best SHORT: ... │
```

### Technical Details

**File: `src/components/dashboard/MostVolumeBar.tsx`**

1. Remove the separate `{/* Buy/Sell insight line */}` block (lines 266-284) that renders below each session row.
2. Move the buy/sell insight spans **inside** the main session row `<div>` (the flex row at line 209-264), placing them after the LIVE badge (for active) or after volume (for completed). The insight spans keep their existing green/red styling and font size.
3. Add `flexWrap: "wrap"` to the main row div so that on narrow screens the insights can wrap to a second line gracefully within the same bordered row.

Single file edit, purely a layout restructure — no logic or data changes.

