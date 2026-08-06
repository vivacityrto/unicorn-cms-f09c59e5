# Audit: 2026-05-13 — TICKET-003 `enrol_as_impersonator` tenant match validation

**Trigger:** TICKET-003 (P2) from the 12 May 2026 deployment status audit — `enrol_as_impersonator` did not validate that the target user belongs to the staff member's active preview tenant; a staff member acting in Tenant A could enrol a user from Tenant B.
**Author:** Carl
**Scope:** `public.enrol_as_impersonator` RPC + `src/hooks/academy/useEnrolCourse.ts`. No other tables, RLS policies, or FK constraints changed.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Background

`enrol_as_impersonator(p_course_id bigint, p_target_user_id uuid)` is a `SECURITY DEFINER` RPC used by staff to enrol a client user into an Academy course while impersonating their tenant. The function validated that the actor was authenticated, was staff, the target user existed, and the course was published. It did not validate that the target user belonged to the specific tenant the staff member was currently acting on behalf of.

The tenant was resolved by `ORDER BY created_at ASC LIMIT 1` on `public.tenant_users` — the target's first-ever tenant — with no reference to the staff member's active impersonation context. A staff member acting in Tenant A who knew or guessed a Tenant B user's UUID could enrol that user and the enrolment would be recorded against Tenant B.

---

## Findings

- **Single call site confirmed:** `src/hooks/academy/useEnrolCourse.ts:28` — only two args passed (`p_course_id`, `p_target_user_id`). No other runtime callers in `src/`.
- **Existing function already hardened:** `SET search_path TO ''` and fully-qualified references were already in place from a prior migration. The new convention (P1-e-ii direction) was already met — no body changes required for search path.
- **`UNIQUE (course_id, user_id)` constraint on `academy_enrollments`:** the Prompt 2 plan proposed tightening the idempotency SELECT to include `tenant_id = p_tenant_id`. This would have missed an existing row with a different `tenant_id` and caused a unique constraint violation on fallthrough INSERT. Caught via live constraint query before Prompt 3; corrected to: SELECT on `(course_id, user_id)` only, then branch on `v_existing.tenant_id <> p_tenant_id` → new `existing_enrolment_different_tenant` error.
- **`v_tenant_id` variable eliminated:** the `ORDER BY created_at ASC LIMIT 1` resolution block removed; `p_tenant_id` used directly in INSERT and idempotency branch.

---

## DB change shipped

### Migration `20260513090000_enrol_as_impersonator_tenant_match.sql`

1. `DROP FUNCTION IF EXISTS public.enrol_as_impersonator(bigint, uuid)` — legacy 2-arg overload removed.
2. `CREATE OR REPLACE FUNCTION public.enrol_as_impersonator(p_course_id bigint, p_target_user_id uuid, p_tenant_id bigint)` — new 3-arg signature. Guards in order:
   - `not_authenticated` / `28000` (unchanged)
   - `not_authorised_impersonator` / `42501` (unchanged)
   - `tenant_context_required` / `22004` — NEW: `p_tenant_id IS NULL`
   - `invalid_target_user` / `P0002` — split from old combined check
   - `target_user_not_in_tenant` / `P0002` — NEW: `NOT EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = p_target_user_id AND tenant_id = p_tenant_id)`
   - `course_not_available` / `P0002` (unchanged)
   - Idempotency SELECT on `(course_id, user_id)` only; post-find branch on `v_existing.tenant_id <> p_tenant_id` → `existing_enrolment_different_tenant` / `P0002` — NEW
   - INSERT uses `p_tenant_id` directly; notes: `'Enrolled by staff impersonation; actor=' || v_actor::text || '; tenant=' || p_tenant_id::text`
3. `REVOKE ALL ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;`
4. `COMMENT ON FUNCTION` updated to document `p_tenant_id` requirement and idempotency key.

**Verification (confirmed via live `pg_proc` / `information_schema` query):**
- V1: single row, args `p_course_id bigint, p_target_user_id uuid, p_tenant_id bigint` — 2-arg overload absent ✅
- V2: `prosecdef = true`, `proconfig` contains `search_path=` (empty) ✅
- V3: `authenticated / EXECUTE` present; no `PUBLIC` grant ✅

---

## Code change shipped

### `src/hooks/academy/useEnrolCourse.ts` — full rewrite

- `import { useClientPreview } from "@/contexts/ClientPreviewContext"` added.
- `const { previewTenant } = useClientPreview()` destructured alongside existing hooks.
- Impersonating branch: client-side null guard added — if `!previewTenant?.id`, throws `Error("tenant_context_required")` before any RPC call (defence-in-depth; DB Guard C also catches this).
- `supabase.rpc("enrol_as_impersonator", { p_course_id, p_target_user_id, p_tenant_id: previewTenant.id })` — third argument added.
- `onError` handler maps before `friendlyDbError` fallback:
  - `tenant_context_required` → `"No active tenant context — exit and re-enter the client view"`
  - `target_user_not_in_tenant` → `"This user does not belong to the current tenant"`
  - `existing_enrolment_different_tenant` → `"This user is already enrolled under a different tenant context"`
- `useAcademyActingUserId` not modified — tenant ID read directly from `useClientPreview()` at call site.

---

## KB changes shipped

No KB changes required. Function hardening conventions (already covering `SET search_path TO ''`) documented in KB PR #34 earlier this session.

---

## Codebase observations (read-only)

- `academy_enrollments` has `UNIQUE (course_id, user_id)` — confirmed via live `pg_constraint` query. This constraint informed the idempotency correction in Prompt 3.
- `academy_enrollments.tenant_id` FK: `REFERENCES tenants(id) ON DELETE SET NULL` — not a blocker; `p_tenant_id` is validated against `public.tenant_users` before INSERT.
- `academy_enrollments.user_id` FK: `REFERENCES auth.users(id) ON DELETE CASCADE` — same FK confirmed safe from TICKET-007 (auth gate on picker ensures `actingUserId` is always a confirmed `auth.users` entry).

---

## Decisions

- `p_tenant_id` passed explicitly by caller (not derived server-side) — the function cannot reliably determine the staff member's active preview context server-side; caller is the authoritative source.
- Idempotency SELECT kept on `(course_id, user_id)` to match the unique constraint — not tightened to include `tenant_id`, which would have caused a unique violation on fallthrough INSERT.
- `existing_enrolment_different_tenant` added as a new error path — rare in practice but surfaces a previously silent unique constraint violation with a meaningful message.
- `useAcademyActingUserId` not extended — single responsibility (user ID only); tenant context read directly at call site.

---

## Open questions parked

- **`existing_enrolment_different_tenant` in practice:** this fires if a user was previously enrolled under a different tenant context (e.g. an old impersonation session for a different tenant). In practice unlikely but not impossible if users ever belong to multiple tenants. No remediation path exists in the UI today — staff would need to investigate via Studio.
- **Self-enrol path (`enrol_in_academy_course`):** untouched by this ticket. Not a `SECURITY DEFINER` function; uses RLS for scoping. No tenant match gap in that path.

---

## Tag

`audit-2026-05-13-ticket-003-enrol-as-impersonator-tenant-match`
