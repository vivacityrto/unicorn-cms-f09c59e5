# Audit: 2026-09-09 — swap_tenant_user_to_contact self-swap guard (L10 #31)

**Trigger:** ad-hoc — Carl-reported regression, `l10-real-bugs-found.md` #31
("Client portal admins can remove their own login by mistake")
**Scope:** the `swap_tenant_user_to_contact` RPC and its two frontend
callers (`ClientUsersPage.tsx`, `TenantUsersTab.tsx`). No other RPC, table,
or policy touched.

## Findings

- Both UI callers already hide the "Swap to Contact" menu item for the
  signed-in caller's own row (`ClientUsersPage.tsx:621`,
  `TenantUsersTab.tsx:1309`), added 2026-08-27 in PR #423 — **before** Carl's
  2026-09-07 report. The originally-reported symptom (a visible self-swap
  button) is very likely already stale.
- The underlying RPC (`supabase/migrations/20260827020000_contact_swap_promote_timeline_events.sql:51-185`,
  confirmed identical to the live `pg_get_functiondef` output before this fix)
  never checked `p_user_id` against the caller at all. Its only related
  safeguard — refusing to remove a tenant's *last* admin-tier contact — does
  not block self-targeting when a tenant has two or more admin contacts
  (e.g. a primary + a secondary), which is exactly Demo RTO's live shape
  (tenant 7547: primary_contact = James Okafor, secondary_contact = Carl's
  own demo login).
- Confirmed live and safely (see verification below): before this fix, a
  caller holding a `secondary_contact` seat at a tenant with another admin
  present could call the RPC directly (bypassing both UI guards) and
  self-swap successfully.
- This is a genuine defense-in-depth gap, not merely a UI oversight: a
  hidden button was never a real fix for a missing server-side check.

## Code changes

- `supabase/migrations/20260909040000_swap_tenant_user_to_contact_self_guard.sql`:
  `CREATE OR REPLACE FUNCTION public.swap_tenant_user_to_contact` (same
  signature, no arity change) adds `IF p_user_id = v_caller THEN RAISE
  EXCEPTION ... USING ERRCODE = 'P0001'; END IF;` immediately after the
  existing authorization check and before any read/write. No other behavior
  changed — grants, the existing authorization gate, and the last-admin
  check are all untouched.
- Applied directly to production via `apply_migration` (this is a
  same-signature `CREATE OR REPLACE`, so no `DROP FUNCTION`/grant changes
  were needed).

## Verification (all live, all safe/reversible, zero data left behind)

1. **Pre-fix vulnerability proof** — wrapped in `BEGIN; SET LOCAL role
   authenticated; SET LOCAL request.jwt.claims = '{"sub":"<demo secondary
   contact uuid>", ...}'; SELECT swap_tenant_user_to_contact(7547, <same
   uuid>); ROLLBACK;`. Returned `{"ok":true,...}` before the fix, proving the
   gap was real and exploitable in production. `ROLLBACK` guaranteed nothing
   persisted; confirmed afterward by re-reading the `tenant_users` row
   (unchanged) and the `tenant_contacts` id the call had returned (never
   existed).
2. **Post-fix guard proof** — identical simulated call after the migration
   raised `P0001: Cannot swap yourself to a contact — ask another admin to
   do this for you`, exactly as intended.
3. **Regression check** — the same simulated caller swapping a *different*
   existing tenant_users row (a pre-existing fixture "Ghost User3" row, not
   a real person) at the same tenant still returned `{"ok":true,...}`,
   confirming normal (non-self) swaps are unaffected. Again wrapped in
   `ROLLBACK`; confirmed no rows were left behind.
4. **Live Playwright, real authenticated session (Demo RTO, `carl+demo@vivacity.com.au`):**
   - UI check: opened the "User actions" menu for every row on `/client/users`
     — present for 3 of 7 rows, explicitly absent for the signed-in user's
     own row, confirming the existing UI guard still works correctly and
     isn't a blanket rendering gap.
   - Server-side check: from that same authenticated browser session,
     called `supabase.rpc('swap_tenant_user_to_contact', {p_tenant_id:
     7547, p_user_id: <own uuid>})` directly (bypassing the UI entirely) —
     received the real PostgREST error `P0001: Cannot swap yourself to a
     contact...`, proving the fix holds through the actual JWT/RLS path,
     not just a raw-SQL simulation. Zero page errors observed.
   - No seed data was required — Demo RTO's tenant (7547) already had two
     real admin-tier contacts, which is exactly the reproduction shape
     needed. Nothing was created, so nothing needed cleanup.
   - Standard checks also run clean on this branch: `typecheck` (0 errors),
     `test:frontend` (343 passed / 43 skipped), `test:edge` (279 passed).
     `lint:ratchet` reported no changed `.ts`/`.tsx` files (this PR is
     SQL-only).

## Decisions

- None required — this is a pure hardening fix with no behavior change for
  any legitimate (non-self) caller.

## Open questions parked

- None. The originally-reported "visible button" symptom was not
  reproduced (already fixed by PR #423); the real, still-live gap was the
  missing server-side check, which this entry closes.
