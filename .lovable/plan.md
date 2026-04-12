

## Enhance Lounge Chat with "My Profile" Link and First-Visit Profile Prompt

### What We'll Build

1. **"My Profile" clickable text** next to "Lounge Chat" header — clicking it will open a profile dialog (placeholder for now, full UI design coming later)

2. **First-visit profile completion popup** — when the page loads, if the user's `full_name` is empty/null (meaning they haven't completed their profile), a styled modal appears in the gold/amber lounge theme telling them they must complete their profile before chatting

3. **Chat locked until profile is complete** — the input area is disabled/overlaid with a message until `full_name` (and optionally `nickname`) is filled in. Once saved, chat unlocks immediately

4. **Basic "My Profile" dialog** — a simple form with name and nickname fields styled in the lounge theme. This is the placeholder that will be enhanced later with a full UI design

### Changes

**`src/components/dashboard/LoungeChat.tsx`**
- Add `useProfile` hook to check if the user has completed their profile
- Add "My Profile" text (smaller, clickable) next to the "Lounge Chat" heading
- Add state for showing the profile dialog and the first-visit prompt
- On first load: if `profile.full_name` is null/empty, show the welcome prompt modal automatically
- When chat is locked: disable input, show overlay message "Complete your profile to start chatting"
- Clicking "My Profile" opens the profile dialog at any time

**`src/components/dashboard/LoungeProfileDialog.tsx`** (new)
- A styled dialog/modal matching the lounge gold/black theme
- Fields: Full Name (required), Nickname (optional)
- Save button calls `updateProfile` from `useProfile`
- On save success: close dialog, chat unlocks, refetch profile

**`src/components/dashboard/LoungeProfilePrompt.tsx`** (new)
- The first-visit overlay/modal in gold theme
- Message: "Welcome to the Lounge. Please complete your profile to start chatting."
- Single button: "Complete My Profile" → opens the profile dialog
- Only appears once (when `full_name` is empty)

### How Profile Completion Is Tracked

We use the existing `profiles.full_name` field — if it's null or empty, the user hasn't completed their lounge profile. No new database tables or columns needed. The `nickname` field is already in the profiles table and will be used as the display name in chat when present, falling back to `full_name`.

### Files

| File | Action |
|------|--------|
| `src/components/dashboard/LoungeChat.tsx` | Modify — add profile check, "My Profile" link, locked state |
| `src/components/dashboard/LoungeProfileDialog.tsx` | Create — profile edit form dialog |
| `src/components/dashboard/LoungeProfilePrompt.tsx` | Create — first-visit welcome prompt |

