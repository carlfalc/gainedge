

## Enhanced RON PATTERN Bar — Timestamp, Two-Pattern History, and Direction Hint

### Changes (all in `src/pages/dashboard/ChartsPage.tsx`)

**1. Detection timestamp (browser local time)**
- Add `patternDetectedAt` state (`string | null`).
- When patterns are detected (~line 959), capture `new Date().toLocaleTimeString()` if any named patterns exist, otherwise clear it.
- Display timestamp in the RON PATTERN bar after the confidence score: `| Detected: 14:20:05`.

**2. Show the two most recent patterns (not just one)**
- Add `patternHistory` state as an array of `{ pattern: DetectedPattern; detectedAt: string }[]`, capped at 2 entries.
- Each time detection runs and finds named patterns, prepend the top-confidence pattern to the history (if it's different from the current first entry, or if its confidence changed). Keep max 2 items.
- In the RON PATTERN bar, render the most recent pattern on the first line and the previous pattern on a second line (smaller, dimmer text). If only one pattern exists, just show that one.

**3. Direction hint for less experienced traders**
- Next to each pattern name, add a short plain-English label indicating the expected move:
  - Bullish patterns: `"⬆ Potential bullish move"` (green text)
  - Bearish patterns: `"⬇ Potential bearish move"` (red text)
- This appears right after the pattern name so traders immediately understand what the pattern suggests, e.g.:
  `Double Bottom — ⬆ Potential bullish move | Target: 2,450.00 | Confidence: 7/10 | Detected: 14:20:05`

### UI Layout of RON PATTERN Bar

```text
RON PATTERN | Double Bottom — ⬆ Potential bullish move | Target: 2,450 | 7/10 | 14:20:05  | 3 S/R levels | [Labels ON]
              Prev: Bull Flag — ⬆ Potential bullish move | 6/10 | 14:15:32
```

- Second line only appears if there's a previous pattern.
- Second line is smaller text (`text-[9px]`) and dimmer (`text-white/50`).

### No other files affected
All changes are in `ChartsPage.tsx` — the pattern detection logic, state, and the RON PATTERN bar JSX section.

