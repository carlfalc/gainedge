

## Plan: Add RON Character Avatar to Ask RON Button

### What Changes
Add the uploaded RON character image as a small circular avatar (~24px) inside the "Ask RON" button in the dashboard header, positioned to the left of the "Ask RON" text.

### Space Assessment
The header is 56px tall. The button currently has `padding: 4px 12px` and contains text + a mic icon. A 24px circular avatar fits comfortably — it's the same height as the text line. The left section has plenty of horizontal room before it reaches the centered world clocks.

### Technical Details

**File: `src/components/dashboard/DashboardLayout.tsx`**

1. **Copy the uploaded image** to `src/assets/ron-avatar.png`
2. **Import** the image at the top of DashboardLayout: `import ronAvatar from "@/assets/ron-avatar.png"`
3. **Add an `<img>` tag** inside the Ask RON button, before the "Ask RON" text span:
   ```tsx
   <img src={ronAvatar} alt="RON" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
   ```
4. The button layout order becomes: **RON avatar → "Ask RON" text → Mic icon**

Single file change + one asset copy. No new dependencies.

