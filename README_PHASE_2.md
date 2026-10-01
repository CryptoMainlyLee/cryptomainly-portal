# CryptoMainly Phase 2A — Read-Only VIP Admin Dashboard

Target project: `CryptoMainlyLee/cryptomainly-portal`
Production baseline verified through Vercel: Next.js 14.2.33, App Router.

## What this adds

- `/admin/vip/login` — private admin login
- `/admin/vip` — read-only live membership dashboard
- `/admin/vip/[memberId]` — read-only member detail/history
- No changes to `/` or the existing public widgets/API routes
- No membership writes
- No Telegram actions
- No reminder/removal automation
- No payment activation

## Required Vercel environment variables

Set these for Production (and Preview if desired):

```text
SUPABASE_URL=https://otxdpitcjsniyzmaswbw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Supabase secret service-role key>
CM_ADMIN_PASSWORD=<strong unique admin password>
```

Important:
- NEVER prefix either secret with `NEXT_PUBLIC_`.
- `SUPABASE_SERVICE_ROLE_KEY` is used only inside server-only modules.
- Use a long, unique `CM_ADMIN_PASSWORD` (20+ random characters recommended).

## Database backend already prepared

The live Supabase project now contains:
- `admin_member_overview` — `security_invoker = true`
- `admin_member_history` — `security_invoker = true`

Privileges verified:
- `service_role`: SELECT = allowed
- `anon`: SELECT = denied
- `authenticated`: SELECT = denied

All existing Phase 1 safety switches remain OFF.

## Installation

Copy the supplied `app/admin/vip` directory into the repository root so it becomes:

```text
app/
  admin/
    vip/
      page.tsx
      actions.ts
      layout.tsx
      login/
        page.tsx
      [memberId]/
        page.tsx
      _lib/
        auth.ts
        data.ts
```

No npm dependency is added.

## Verification checklist

1. Run `npm run build`.
2. Confirm the existing `/` route still builds unchanged.
3. Open `/admin/vip` — it should redirect to `/admin/vip/login`.
4. Wrong password should remain locked out.
5. Correct password should show:
   - 74 total members
   - 15 ACTIVE
   - 7 active paid
   - 8 active complimentary
   - 59 FORMER
6. Open a member detail page.
7. Confirm no edit/renew/remove controls exist.
8. Confirm the service-role key is not present in browser HTML/JS.
9. Deploy as a preview first.
10. Only promote to production after visual/data reconciliation.

## Why temporary password auth in Phase 2A?

This read-only verification phase deliberately avoids changing the existing site's
dependency graph or enabling any database write policies. The password is stored
only as a Vercel server environment variable; the browser receives only a
SHA-256-derived, httpOnly session cookie.

Before Phase 2 write controls are enabled, migrate admin authentication to the
planned Supabase Auth/admin-user model and add explicit audit-backed authorization.
Preview redeploy trigger — 23/08/2026
