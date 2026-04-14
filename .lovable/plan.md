

## Make Signal Notifications Persistent Until Manually Dismissed

### Problem
Currently, notifications auto-dismiss after 15 seconds and are capped at 5. If a user is away from their computer, they miss signals entirely.

### Changes

**File: `src/components/dashboard/TradeNotificationPopup.tsx`**

1. **Remove the auto-dismiss timer** — delete the `useEffect` block (lines 46-52) that removes the oldest notification after 15 seconds.

2. **Remove the `.slice(0, 5)` cap** on lines 85 and 116 — allow unlimited notifications to stack. They only disappear when the user clicks X.

3. **Add a scrollable container** — wrap the notification list in a scroll area with `maxHeight: calc(100vh - 100px)` and `overflowY: auto` so if many notifications accumulate, the user can scroll through them. Each card stacks vertically below the previous one (already using `flexDirection: column` with `gap: 10`).

4. **Add a "Clear All" button** — when there are 2+ notifications, show a small "Clear All" link at the top of the stack so the user can dismiss everything at once.

That's it — the layout already positions cards top-right and stacks them vertically. The only real changes are removing the auto-dismiss and the cap.

