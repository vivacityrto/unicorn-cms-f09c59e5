# Audit: 2026-05-12 — TICKET-007 Acting-user picker auth gate

**Trigger:** TICKET-007 (P0) from the 12 May 2026 deployment status audit — staff impersonating a tenant whose primary contact had not yet accepted their invite triggered an FK violation when Academy lesson progress was written.
**Author:** Carl
**Scope:** `ClientPreviewContext.loadActingUserOptions` — replace the unfiltered `tenant_users` query with a `SECURITY DEFINER` RPC that JOINs `auth.users` and excludes unconfirmed, deleted, or banned identities. No RLS, FK, or data changes. No other files modified.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Background

`ClientPreviewContext.loadActingUserOptions` populated the Academy acting-user picker by querying `tenant_users` joined with `public.users`. It excluded rows where `user_uuid` was null but applied no filter against `auth.users`. A tenant_users row whose invitation had not yet been accepted — i.e. whose `auth.users` row was absent or had `email_confirmed_at IS NULL` — was eligible to become the default `actingUserId`.

That UUID then flowed through `useAcademyActingUserId` to `AcademyLessonViewerPage`, which upserts `academy_lesson_progress` with `user_id: actingUserId`. The column has an FK on `auth.users(id)`. When the acting user was unconfirmed the FK constraint fired.

**Confirmed production evidence:** tenant 6372 — `dave@zuut.com.au` had `email_confirmed_at IS NULL` and was the tenant's primary contact, making it the default `actingUserId` on every preview start for that tenant.

---

## Findings

- **Root cause:** `loadActingUserOptions` joined `tenant_users → public.users` only. `auth.users` was never consulted.
- **Blast radius:** Every Academy write path derived `user_id` from `actingUserId` via `useAcademyActingUserId`. Three write sites in `AcademyLessonViewerPage` (lines 215–224, 237–248, 348–359) plus the `enrol_as_impersonator` RPC call in `useEnrolCourse` (impersonation branch). All share the same root: `actingUserId` was resolved from the unfiltered option list.
- **`useClientActingUser` confirmed out of scope:** Consumers are `ClientTopbar.tsx`, `ClientProfilePage.tsx`, `ClientHomePage.tsx` — display only. No write paths.
- **Previous audit targeted wrong hook:** A prior Lovable audit for this ticket proposed fixing `useClientActingUser`. Caught before implementation; corrected by independent grep and file reads confirming the correct target was `ClientPreviewContext`.
- **Anon EXECUTE exposure:** Supabase's default schema grant had auto-extended `EXECUTE` to `anon` on the new RPC. Caught and revoked before the fix was considered complete.

---

## DB change shipped

### Migration `<timestamp>_list_acting_user_options.sql`

```sql
CREATE OR REPLACE FUNCTION public.list_acting_user_options(p_tenant_id bigint)
RETURNS TABLE (
  user_uuid uuid,
  full_name text,
  email text,
  relationship_role text,
  is_default boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    u.user_uuid,
    COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
             u.email, 'Unnamed user') AS full_name,
    COALESCE(u.email, '') AS email,
    COALESCE(tu.relationship_role::text, 'user') AS relationship_role,
    (tu.primary_contact = true OR tu.relationship_role::text = 'primary_contact') AS is_default
  FROM public.tenant_users tu
  JOIN public.users u ON u.user_uuid = tu.user_id
  JOIN auth.users au ON au.id = u.user_uuid
  WHERE tu.tenant_id = p_tenant_id
    AND au.email_confirmed_at IS NOT NULL
    AND au.deleted_at IS NULL
    AND (au.banned_until IS NULL OR au.banned_until < now())
  ORDER BY is_default DESC, full_name ASC;
$$;

REVOKE ALL ON FUNCTION public.list_acting_user_options(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_acting_user_options(bigint) TO authenticated;
```

Additionally: `REVOKE EXECUTE ON FUNCTION public.list_acting_user_options(bigint) FROM anon` — Supabase had auto-extended the grant; revoked as part of this migration.

**Verification (confirmed via live `pg_proc` / `information_schema` query):**
- `prosecdef = true`, `provolatile = s` (STABLE), `proconfig = ['search_path=public']` ✅
- Final ACL: `{postgres, authenticated, service_role}` — `anon` absent, `PUBLIC` never granted ✅
- V4 cross-check: `dave@zuut.com.au` (tenant 6372, `email_confirmed_at IS NULL`) confirmed present in exclusion query and absent from RPC output ✅

---

## Code change shipped

### `src/contexts/ClientPreviewContext.tsx` — `loadActingUserOptions` rewrite

Lines 58–92 replaced. Function signature and `ActingUserOption` type unchanged.

**Before:** `.from("tenant_users").select("user_id, relationship_role, primary_contact, users:user_id ( user_uuid, first_name, last_name, email )")` + per-row loop to derive `fullName` and `is_default` + JS `.sort()`.

**After:**
```typescript
async function loadActingUserOptions(tenantId: number): Promise<ActingUserOption[]> {
  const { data, error } = await supabase
    .rpc("list_acting_user_options", { p_tenant_id: tenantId });
  if (error) {
    console.error("Failed to fetch acting user options (RPC):", error);
    return [];
  }
  return (data ?? []) as ActingUserOption[];
}
```

Net diff: ~25 lines removed, 4 lines added. JS loop, `fullName` derivation, `is_default` derivation, and `.sort()` all removed — the RPC delivers these fields with `ORDER BY` applied.

All callers unchanged: `startPreview`, `fetchActingUserOptions`, `setActingUserId`.

---

## KB changes shipped

No KB changes required.

---

## Codebase observations (read-only)

- Migration applied to `yxkgdalkbrriasiyyrwk` — timestamp recorded in `supabase_migrations.schema_migrations`.
- `src/contexts/ClientPreviewContext.tsx` — `loadActingUserOptions` lines 58–92 replaced.

---

## Decisions

- Fix placed at `loadActingUserOptions` (the single source of `actingUserOptions` and `actingUserId`), not at individual write sites — plugs all downstream write paths in one change.
- `SECURITY DEFINER` required: `auth.users` is not queryable by `authenticated` directly; the RPC runs as function owner (`postgres`) which has the necessary access.
- `anon` EXECUTE revoked: the function has no legitimate unauthenticated caller; locking it to `authenticated` + `service_role` only.
- Session restore defensive validation (lines 111–132) parked: sessionStorage is tab-scoped and short-lived; poisoned sessions from before deploy expire naturally. Not worth the async complexity for a transient window.
- `setActingUserId` validation not added: once the picker only surfaces confirmed UUIDs, no normal UI flow can construct an invalid one.

---

## Open questions parked

- **Session restore gap** — `useEffect` (lines 111–132) restores `actingUserId` from sessionStorage without re-validating against the new RPC. A session started before this deploy could still hold an unconfirmed UUID for the remainder of that browser tab's life. Recommend a follow-up: on restore, if `actingUserOptions` is non-empty, re-call `fetchActingUserOptions` and drop `actingUserId` if the stored UUID is absent from the fresh list.
- **`setActingUserId` — no validation** — the setter accepts any string. Now that the picker is gated, this is low-risk, but a UUID-format guard or presence-in-options check would make the contract explicit. Deferred.
- **`useEnrolCourse` RPC path** — `enrol_as_impersonator` also writes with the acting UUID. Plugged by this fix at source. The RPC body itself (`academy_enrollments.user_id` → `auth.users(id)` FK) should be verified in a separate hardening pass.

---

## Tag

`audit-2026-05-12-ticket-007-acting-user-picker-auth-gate`
