# Plan: Storage buckets `doc-templates` & `generated-docs` (final)

All five decisions confirmed. This is the production-ready migration.

## Pre-flight audit (re-verified)

- **`is_vivacity_team_safe(p_user_id uuid)`** — exists, `SECURITY DEFINER`, `row_security=off`, no default arg → policies will call `public.is_vivacity_team_safe(auth.uid())` explicitly.
- **`pdp_cycles`** — schema confirmed: `id bigint`, `user_id uuid`, `manager_id uuid`, `tenant_id bigint`. Not touched by this migration (RLS unchanged).
- **`storage.buckets`** — neither `doc-templates` nor `generated-docs` exists. 25 unrelated buckets present, none impacted.
- **`pg_policies` on `storage.objects`** — zero policies currently reference `doc-templates`, `generated-docs`, or `pdp%`. No name collisions.
- **No code references** either bucket id (ripgrep across `.ts`/`.sql`).
- **FK constraints** — none. Storage buckets have no FK to `pdp_cycles` or `users`; relationships are encoded purely in the object `name` (path) and enforced in policies/Edge Function logic.

## Migration SQL

### Step 1 — Create buckets (idempotent)

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('doc-templates',  'doc-templates',  false, 52428800, NULL),
  ('generated-docs', 'generated-docs', false, 10485760,
   ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;
```

### Step 2 — RLS policies for `doc-templates` (Vivacity staff full CRUD)

```sql
CREATE POLICY "doc-templates: staff select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'doc-templates' AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "doc-templates: staff insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'doc-templates' AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "doc-templates: staff update"
  ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'doc-templates' AND public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (bucket_id = 'doc-templates' AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "doc-templates: staff delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'doc-templates' AND public.is_vivacity_team_safe(auth.uid()));
```

### Step 3 — RLS policy for `generated-docs` (owner OR staff SELECT only)

```sql
CREATE POLICY "generated-docs: owner or staff select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'generated-docs'
    AND (
      (
        (storage.foldername(name))[1] = 'pdp'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR public.is_vivacity_team_safe(auth.uid())
    )
  );
```

No INSERT / UPDATE / DELETE policies — service role bypasses RLS, so the Edge Function writes freely while browser writes are denied by default. Managers, tenant admins, and any other authorised reader receive a signed URL minted by `pdp-export` (mirrors `audit-reports` and `academy-certificates`).

### Step 4 — Verification queries (run after migration)

```sql
-- Buckets created with correct config
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id IN ('doc-templates','generated-docs');

-- Exactly 5 new policies, all scoped correctly
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND (policyname LIKE 'doc-templates:%' OR policyname LIKE 'generated-docs:%')
ORDER BY policyname;

-- Sanity: no other storage policies were touched
SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects';
```

Expected: 4 `doc-templates:*` policies + 1 `generated-docs:*` policy = +5 vs baseline.

## Rollback (kept in migration comment, not auto-run)

```sql
DROP POLICY IF EXISTS "doc-templates: staff select"   ON storage.objects;
DROP POLICY IF EXISTS "doc-templates: staff insert"   ON storage.objects;
DROP POLICY IF EXISTS "doc-templates: staff update"   ON storage.objects;
DROP POLICY IF EXISTS "doc-templates: staff delete"   ON storage.objects;
DROP POLICY IF EXISTS "generated-docs: owner or staff select" ON storage.objects;
DELETE FROM storage.objects WHERE bucket_id IN ('doc-templates','generated-docs');
DELETE FROM storage.buckets WHERE id IN ('doc-templates','generated-docs');
```

Safe at any time — both buckets are net-new and unreferenced.

---

## Summary of changes

| Change | Scope | Reversible |
|---|---|---|
| 2 new private buckets | `storage.buckets` (insert-only) | Yes |
| 5 new RLS policies | `storage.objects` (additive, bucket-scoped) | Yes |
| 0 schema changes elsewhere | — | — |
| 0 FK changes | — | — |
| 0 function/trigger changes | — | — |
| 0 application code changes | Edge Function deploy is next session | — |

## Benefits

- **Audit-ready DOCX exports** can land in a private, MIME-locked bucket with a 10 MB ceiling.
- **Template authoring** is staff-gated and parity-aligned with `package-documents` (50 MB).
- **Defence in depth**: even if the Edge Function leaks a path, browser users can only read their own `pdp/{uid}/*` objects.
- **No path-segment cast** in policy → no risk of `invalid input syntax for type bigint` breaking listings.
- **Consistent with existing patterns** (`audit-reports`, `academy-certificates`) — signed URLs handle delegated reads.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Edge Function (next session) writes to a path other than `pdp/{user_id}/{cycle_id}/...` and owner SELECT silently denies user | Medium | User can't fetch their own export directly | Document path convention in the Edge Function; users still get signed URL fallback |
| Future need to export PDF from `generated-docs` | Low–Medium | Upload rejected by MIME filter | Single-line ALTER to extend `allowed_mime_types` later |
| Manager/tenant-admin expects direct browser access | Low (decision 1) | Confusion only | Already routed via signed URL from `pdp-export` |
| `is_vivacity_team_safe` overloaded later with breaking signature | Very Low | Policy compile-fail on next migration | Function is widely used; any change would be cross-cutting |
| Storage objects orphaned if a `pdp_cycles` row is deleted | Low | Stale files | Add a future `delete_pdp_cycle_cascade` step (out of scope) |

## Confirmed non-impacts

- **No existing RLS policy modified or dropped.** All 5 new policies are additive and bucket-scoped — no policy on any other bucket can be evaluated for these `bucket_id`s.
- **No FK constraints touched.** Storage has no FKs to `pdp_cycles`, `users`, or `tenant_users`.
- **No existing buckets renamed, re-permissioned, or deleted.**
- **`pdp_cycles`, `users`, `tenant_users`, `tenant_csc_assignments` schemas and policies — unchanged.**
- **`pdp-export` Edge Function — not deployed in this session;** RLS is the only change. When the function lands next session it must use `SUPABASE_SERVICE_ROLE_KEY` for writes and mint signed URLs for delegated reads.
- **Signed-URL minting** continues to work identically to `audit-reports` (already proven by `AuditExportCard.tsx`).
