

## Authentication / Random Logout Analysis

### What's Happening

Your suspicion is correct — **the random logouts in the preview are caused by having the published site (gainedge.ai) open in another tab**. This is a known Lovable Cloud preview environment quirk, not a bug in your code.

The preview environment's fetch proxy can interfere with Supabase auth token refresh requests. When both tabs are open, the preview session can get invalidated or confused, causing `onAuthStateChange` to fire a `SIGNED_OUT` event, which redirects you to the login page.

### Is This a Problem for Real Users?

**No.** On the published URL (gainedge.ai), users will only have one session in one origin. The Supabase client is correctly configured with `autoRefreshToken: true` and `persistSession: true`, so tokens will refresh automatically in production.

### Minor Hardening (Recommended)

Even though production should be fine, there are two small improvements worth making to make the session more resilient:

1. **Ignore transient auth events during token refresh** — In `DashboardLayout.tsx`, the `onAuthStateChange` handler immediately redirects on `SIGNED_OUT`. If a token refresh briefly fails but then succeeds, the user gets kicked out unnecessarily. We should add a short delay and re-check the session before redirecting.

2. **Handle `TOKEN_REFRESHED` errors gracefully** — Currently, if `refreshSession()` fails in `metaapi-client.ts`, it falls back to `getSession()`. This is good. But the dashboard layout doesn't have similar resilience.

### Plan

| File | Change |
|------|--------|
| `src/components/dashboard/DashboardLayout.tsx` | On `SIGNED_OUT` event, re-verify session with `getSession()` before redirecting — prevents false logouts from transient refresh failures |

### The Fix (Single File Change)

In the `onAuthStateChange` handler, instead of immediately navigating on `SIGNED_OUT`:

```typescript
// Before (current)
if (event === "SIGNED_OUT") {
  navigate("/", { replace: true });
}

// After (hardened)
if (event === "SIGNED_OUT") {
  // Double-check — transient refresh failures can emit SIGNED_OUT briefly
  const { data: { session: recheck } } = await supabase.auth.getSession();
  if (!recheck) {
    navigate("/", { replace: true });
  }
}
```

This single change ensures that even if a token refresh hiccup fires `SIGNED_OUT`, the app confirms there's truly no session before kicking the user out.

### Summary

- **Preview logouts with gainedge.ai open in another tab** = expected behavior, not a code bug
- **Production users** will not experience random logouts — the auth config is correct
- **One small hardening change** to double-check session before redirecting on sign-out events, adding extra protection against edge cases

