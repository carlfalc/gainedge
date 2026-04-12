

## Set Up Your Own Google OAuth for gainedge.ai

Your understanding is correct:
- Users visit `https://gainedge.ai` → click Login → `https://gainedge.ai/login`
- Google OAuth completes → lands on `https://gainedge.ai/dashboard`

### What You Need to Do

**Step 1 — Google Cloud Console setup**

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create (or edit) an **OAuth 2.0 Client ID** (Web application type)
3. Under **Authorized JavaScript origins**, add:
   - `https://gainedge.ai`
   - `https://www.gainedge.ai` (if you use www)
4. Under **Authorized redirect URIs**, add the callback URL shown in your Lovable Cloud Authentication Settings (Cloud → Users → Auth Settings → Google). This is the URI that handles the OAuth callback.
5. On the **Consent Screen** page, add `gainedge.ai` under Authorized domains

**Step 2 — Enter credentials in Lovable Cloud**

1. Open Cloud → Users → Auth Settings → Google
2. Switch from managed to custom credentials
3. Paste your **Client ID** and **Client Secret** from Google Cloud Console

**Step 3 — Fix the auth redirect race condition (code change)**

The current code has a bug where `DashboardLayout.tsx` redirects to `/` before the session finishes loading. This is why Google login bounces back to the landing page. The fix:

- **`DashboardLayout.tsx`**: Add an `authLoading` state — wait for `getSession()` to resolve before redirecting unauthenticated users to `/`
- **`Login.tsx`**: Keep the current `onAuthStateChange` listener (it correctly catches OAuth returns and navigates to `/dashboard`)
- **`Index.tsx`**: Remove or guard the broad auth redirect that competes with the login page

This is a small code change (3 files) that fixes the "bouncing back to landing page" problem for both Google login and preview navigation.

### Expected Result

- `https://gainedge.ai/login` → Google sign-in → `https://gainedge.ai/dashboard` ✓
- Preview page selection stays on the selected route ✓
- Users see your own brand name on the Google consent screen ✓

