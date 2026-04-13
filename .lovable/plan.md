

## Notification System — How It Works & What We Can Build

### What You Already Have

**On-Screen Notifications (Working)**: `TradeNotificationPopup` already listens via Supabase Realtime for new signals and high-confidence scans. It shows toast-style popups in the top-right corner with auto-dismiss after 15 seconds. This works on whichever tab/page you're currently viewing.

**Settings Toggles (Saved but not wired)**: The profile stores `email_alerts`, `push_notifications`, and `sms_alerts` booleans — but no actual sending logic is connected to them yet.

---

### Channel Breakdown

#### 1. On-Screen Notifications (Already Working)
- These are the popups you see — powered by Supabase Realtime subscriptions
- They only appear on the tab that's actively open and subscribed
- **"Push notifications" on your settings page currently refers to this** — it's an in-app notification, not a browser push notification
- No changes needed here unless you want to enhance the UI

#### 2. Email Alerts (Can Build Now)
**What it does**: When RON fires a signal or live trade, send an email to the user's registered email address with the trade details (symbol, direction, entry, TP, SL, confidence).

**What's needed**:
- Your project has a custom domain (`www.gainedge.ai`) that can be used for email sending
- An email domain needs to be set up (currently one exists for a different domain but is pending DNS)
- We'd set up the `gainedge.ai` domain for email, scaffold the email infrastructure, create a "signal-alert" email template, then wire the `push-scan` and `update-signal` edge functions to also invoke `send-transactional-email` when `email_alerts = true` on the user's profile

**Requirements**: Set up email domain for `gainedge.ai` via the built-in email system — no third-party connectors needed.

#### 3. Browser Push Notifications (Can Build)
**What it does**: Native browser notification popups (the ones that appear even when the browser tab isn't focused, with the OS notification sound). These work across all open tabs and even when the tab is in the background.

**What's needed**:
- Use the Web Notifications API (`Notification.requestPermission()` + `new Notification(...)`)
- When the Supabase Realtime subscription fires a new signal/trade, trigger a browser notification if the user has granted permission and `push_notifications = true`
- This is purely client-side — no third-party service needed
- The user gets a browser permission prompt the first time

**Important distinction**: This is NOT the same as mobile push notifications (which require Firebase/APNs). This is browser-only push notifications that work on desktop and mobile browsers.

#### 4. SMS Alerts (Parked)
As you said, we won't wire this now. Would require a third-party SMS provider (e.g. Twilio connector).

---

### Implementation Plan

| Step | What | Details |
|------|------|---------|
| 1 | **Set up email domain** | Configure `gainedge.ai` for email sending via built-in email system |
| 2 | **Create signal alert email template** | React Email template showing symbol, direction, confidence, entry/TP/SL |
| 3 | **Wire email sending in edge functions** | When `push-scan` creates a signal with confidence >= threshold, check user's `email_alerts` preference and send email |
| 4 | **Add browser push notifications** | In `TradeNotificationPopup`, request notification permission and fire `new Notification()` alongside the on-screen popup when `push_notifications = true` |
| 5 | **Add permission request UI** | When user enables "Push Notifications" toggle in settings, prompt for browser notification permission |

### Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/functions/_shared/transactional-email-templates/signal-alert.tsx` | New email template for signal/trade alerts |
| `supabase/functions/_shared/transactional-email-templates/registry.ts` | Register the new template |
| `supabase/functions/push-scan/index.ts` | After inserting scan/signal, check user prefs and send email if enabled |
| `src/components/dashboard/TradeNotificationPopup.tsx` | Add browser `Notification` API calls alongside existing popups |
| `src/pages/dashboard/SettingsPage.tsx` | Add permission request when push toggle is enabled |

### No Third-Party Connectors Needed

- **Email**: Built-in Lovable email system (just needs domain setup)
- **Browser push**: Native Web API, zero dependencies
- **SMS**: Would need Twilio or similar (parked for now)

### First Step

We need to set up the email domain for `gainedge.ai` before we can build the email alerts. I'll present the setup dialog when you approve this plan.

