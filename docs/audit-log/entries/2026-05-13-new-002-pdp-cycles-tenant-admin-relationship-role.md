# Audit: 2026-05-13 — NEW-002 `pdp_cycles` tenant-admin SELECT policy rekey

**Trigger:** NEW-002 (P2) from the 12 May 2026 deployment status audit — `pdp_cycles: tenant admins view their tenant` SELECT policy used boolean columns (`primary_contact = true`) rather than `relationship_role`, inconsistent with the canonical contact-role field established in the 12 May contact-role canonicalisation session.
**Author:** Carl
**Scope:** `public.pdp_cycles` RLS SELECT policy only. No other tables, functions, or data changed.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Background

The 12 May 2026 contact-role canonicalisation session (`audit-2026-05-12-contact-role-canonicalisation`) established `relationship_role` on `tenant_users` as the authoritative contact-role field. Boolean columns (`primary_contact`, `secondary_contact`) are trigger-maintained mirrors kept for backwards compatibility during the transition, but new policy logic must read from `relationship_role`, not the booleans. The `pdp_cycles: tenant admins view their tenant` policy was a survivor using the old boolean pattern.

---

## Verdict

**Closed — policy rekeyed. Verified correct.**

---

## Findings

### Old policy (boolean-based)

```sql
EXISTS (
  SELECT 1 FROM public.tenant_users tu
  WHERE tu.user_id = auth.uid()
    AND tu.tenant_id = pdp_cycles.tenant_id
    AND tu.primary_contact = true
)
```

This admitted only `primary_contact` users. `secondary_contact` admins were excluded — a latent access gap relative to the intended "tenant admins" semantics.

### New policy (relationship_role-based)

```sql
EXISTS (
  SELECT 1 FROM public.tenant_users tu
  WHERE tu.user_id = auth.uid()
    AND tu.tenant_id = pdp_cycles.tenant_id
    AND tu.access_scope = 'full'
    AND tu.relationship_role IN ('primary_contact','secondary_contact')
)
```

Adds `secondary_contact` coverage and `access_scope = 'full'` guard. `access_scope` is set to `full` for both primary and secondary contacts by `accept_invitation_v2`; the guard is defence-in-depth against any future role that carries `relationship_role = 'primary_contact'` without full scope.

---

## DB change shipped

### Migration `20260513090001_pdp_cycles_tenant_admin_relationship_role.sql`

```sql
BEGIN;
DROP POLICY IF EXISTS "pdp_cycles: tenant admins view their tenant" ON public.pdp_cycles;
CREATE POLICY "pdp_cycles: tenant admins view their tenant"
ON public.pdp_cycles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = pdp_cycles.tenant_id
      AND tu.access_scope = 'full'
      AND tu.relationship_role IN ('primary_contact','secondary_contact')
  )
);
COMMIT;
```

**Verification (confirmed via live `pg_policy` query):**
- `using_expr` contains `relationship_role = ANY (ARRAY['primary_contact'::text, 'secondary_contact'::text])` ✅
- `using_expr` does NOT contain `primary_contact = true` ✅
- Pre-existing linter warnings confirmed unrelated to this change — project-wide, not introduced here ✅

---

## KB changes shipped

None. The `relationship_role`-first convention and the transition approach are already documented in `unicorn-kb/pinned/conventions.md` and the contact-role canonicalisation audit.

---

## Codebase observations (read-only)

- `pdp_cycles` table has no other RLS policies that reference boolean contact columns — confirmed by visual inspection during policy scoping.
- `access_scope` field on `tenant_users` is populated by `accept_invitation_v2` and is consistent with `relationship_role` values for all accepted invites.

---

## Decisions

- `access_scope = 'full'` guard added alongside `relationship_role IN (...)` — belt-and-suspenders; both conditions must hold. Cheap EXISTS check; no performance concern.
- `secondary_contact` added to the policy — the old policy was narrower than intended; this corrects the latent gap while staying within the "tenant admin" semantic.
- Boolean columns left in place — not touched here; their deprecation is tracked in the contact-role canonicalisation work.

---

## Open questions parked

- **Other policies on other tables** using `primary_contact = true` or `secondary_contact = true` are not addressed here. Full policy audit across all tables for boolean-based contact checks is a separate backlog item. Count and scope to be established in a future session.

---

## Tag

`audit-2026-05-13-new-002-pdp-cycles-tenant-admin-relationship-role`
