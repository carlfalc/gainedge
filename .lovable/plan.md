

## Plan: Add X Close Button and Drag-and-Drop to Instrument Cards

### What Changes

1. **X button on each card** — A small `X` icon in the top-right corner of every instrument card, next to the existing direction badge. Clicking it hides that card.

2. **Drag-and-drop reordering** — Cards become draggable. Click and hold a card to pick it up, drag it to a new position in the grid, and drop it to reorder.

3. **"CURRENT INSTRUMENT TRACKING" header** — Jade green heading above the grid with a "Show All" button to restore any hidden cards.

### Technical Details

**File: `src/pages/dashboard/DashboardHome.tsx`**

1. **State additions**:
   - `hiddenPanes: Set<string>` — tracks hidden symbols, persisted in `localStorage`
   - `cardOrder: string[]` — custom ordering of symbols, persisted in `localStorage`
   - `dragIndex: number | null` / `dragOverIndex: number | null` — for drag-and-drop tracking

2. **X button**: Add an `X` icon (from `lucide-react`) to the top-right of each card div, positioned alongside the existing direction badge. Clicking sets that symbol into `hiddenPanes`.

3. **Drag-and-drop**: Use native HTML5 drag events (`draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd`) on each card div. On drop, reorder the `cardOrder` array and persist to `localStorage`. A subtle border highlight shows the drop target.

4. **Header bar**: Insert between Highest Conviction and the grid:
   - "CURRENT INSTRUMENT TRACKING" heading (jade green, matching HIGHEST CONVICTION style)
   - "Show All" button with `Eye` icon — resets `hiddenPanes` to empty
   - Count indicator: e.g. "5/7 visible"

5. **Grid filtering**: `scans` filtered by `hiddenPanes` and sorted by `cardOrder` before `.map()`.

No new dependencies — uses native HTML5 drag-and-drop. Single file change.

