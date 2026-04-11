

## Auto-Hide Sidebar on Navigation

### What it does
When the user clicks any menu item, the sidebar fully collapses (hidden off-screen). It reappears when the user hovers over the left edge of the screen, and hides again when the mouse leaves.

### Technical approach

**File: `src/components/dashboard/DashboardLayout.tsx`**

1. **Auto-collapse on navigation**: In each nav button's `onClick`, after calling `navigate(item.path)`, set `collapsed` to `true`.

2. **Replace fixed collapsed width (64px) with fully hidden (0px)**: When collapsed, the sidebar width becomes `0` instead of `64`, making it invisible.

3. **Add a hover trigger zone**: Render a thin invisible `<div>` (about 12px wide) fixed to the left edge. On `mouseEnter`, temporarily expand the sidebar to full 240px width. On `mouseLeave` from the sidebar, collapse it back to 0.

4. **Use a `hovered` state** separate from `collapsed`: `collapsed` tracks the persistent state (always true after nav click). `hovered` is transient — set true on hover, false on leave. Sidebar width = `hovered ? 240 : 0`.

5. **Remove the collapse toggle button** at the bottom (or repurpose it as a pin/unpin toggle if desired).

6. **Apply `overflow: hidden`** on the sidebar so content doesn't leak when width is 0.

### Result
- Click any menu item → sidebar slides away
- Hover left edge → sidebar slides out as an overlay
- Move mouse away → sidebar slides back off-screen

