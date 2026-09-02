---
name: Admin role and admin area
description: Server-enforced admin role via user_roles + has_role, admin area at /dashboard/admin
type: feature
---
- Roles live in `public.user_roles` (enum `app_role`: admin | moderator | user), never on profiles.
- Access checks use the security-definer `has_role(_user_id, _role)` function and the `useAdmin()` hook (`src/hooks/use-admin.ts`).
- Admin area: `/dashboard/admin` (`src/pages/dashboard/AdminPage.tsx`) — role grant/revoke plus broker symbol mappings. Sidebar entry only renders for admins.
- falconercarlandrew@gmail.com (user 7fbe4d0e-e814-4102-b3c4-dfca26cabcac) holds the admin role.
