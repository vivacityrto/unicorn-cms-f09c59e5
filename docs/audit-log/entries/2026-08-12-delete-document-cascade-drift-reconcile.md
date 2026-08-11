# Audit: 2026-08-12 — `delete_document_cascade` live-vs-git drift reconciled

**Trigger:** Follow-up from the same-day Manage Documents duplicate cleanup
(`docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md`),
which found the live `delete_document_cascade` function no longer matches
the version committed in this repo.
**Author:** Claude (session run by Carl)
**Scope:** Reconciliation only — commits a migration matching the
already-live function definition. No new behavior; the migration is a
verified no-op against the current database.
**Supabase project:** hosted `unicorn-cms-f09c59e5` production project.

---

## Findings

- `supabase/migrations/20260323133918_72874c5e-ef31-4378-8035-610da412f7c1.sql`
  is the only version of `delete_document_cascade` in this repo's git
  history. `mcp__supabase__list_migrations` shows a later version,
  `harden_delete_document_cascade_c3`, applied 2026-07-15 — but no file
  matching that name (or any name touching this function) exists anywhere
  in `git log --all`. Confirmed via `pg_get_functiondef` that the live
  function differs from the committed one in two ways:
  1. **Added an authorization check.** The live version calls
     `public.is_vivacity_team_safe(auth.uid())` and raises `42501` if it
     returns false. The committed version has no such check — any role
     with `EXECUTE` on this `SECURITY DEFINER` function could delete any
     document template, regardless of caller identity.
  2. **Fixed a pre-existing bug.** The committed version's
     `DELETE FROM documents_tenants WHERE document_id = p_doc_id` targets a
     column that doesn't exist — `documents_tenants` is a denormalized
     per-tenant snapshot table with no `document_id` FK to `documents` at
     all (confirmed via `information_schema.columns`). Every call to the
     committed version would have thrown a `42703` error before ever
     reaching the final `DELETE FROM documents`, meaning the app's Manage
     Documents "Delete" button — which calls this RPC — could never have
     actually worked while that version was live. The live version instead
     hardcodes `v_tenant_docs_deleted := 0` and skips the delete entirely.
  3. Likely at the same time, the search path was tightened from
     `SET search_path = public` to `SET search_path TO ''` with fully
     qualified (`public.`) references throughout — consistent with the
     broader `l3_*`/`harden_*`/`*_taskNN` security-hardening migrations
     visible in `list_migrations` around 2026-07-15 (e.g.
     `l3_gate_document_ai_cluster`, `harden_preview_document_delete_task20`),
     none of which are in git either. Out of scope to reconcile all of
     those here — flagged as a broader open question below.
- **This drift wasn't caused by, or fixed as part of, this session's
  duplicate-document cleanup.** That cleanup used plain `DELETE` statements
  directly rather than this RPC (see the companion audit entry), so it was
  never blocked by the bug and never depended on the live auth check. The
  drift was simply discovered along the way and is reconciled here as its
  own standalone follow-up, per Carl's request.

---

## DB changes shipped

Migration: `supabase/migrations/20260811235553_harden_delete_document_cascade_c3_reconcile.sql`

`CREATE OR REPLACE FUNCTION public.delete_document_cascade(...)` — full body
copied verbatim from `pg_get_functiondef` against the live function.

Applied directly to prod via Supabase MCP `apply_migration`. **Verified
no-op**: re-ran `pg_get_functiondef` immediately after and confirmed the
result is byte-for-byte identical to the string used in this migration —
the live database was already running this exact code before and after.

---

## Code changes (if this entry accompanies one)

- `supabase/migrations/20260811235553_harden_delete_document_cascade_c3_reconcile.sql`
  — see above.

Branch: `hotfix/reconcile-delete-document-cascade-drift`.

---

## Decisions

- **Reconciled only this one function, not the full 2026-07-15 hardening
  pass.** Several other `l3_*`/`harden_*`/`*_taskNN` migrations from around
  the same date are visible in `list_migrations` with no corresponding git
  file. Widening scope to audit and reconcile all of them was not requested
  and would be a materially larger effort than this follow-up — parked
  below instead.
- **Did not additionally harden the function beyond matching live state**
  (e.g. handling the `client_stage_documents`, `generated_documents`, and
  `governance_document_deliveries` foreign keys that can currently block a
  delete with a raw FK violation instead of a clean error, noted in the
  companion cleanup entry). That would be a behavior change beyond
  "make git match prod," and wasn't asked for in this pass.

---

## Open questions parked

- **Other `l3_*`/`harden_*`/`*_taskNN` migrations from ~2026-07-15 may have
  the same git-vs-prod drift** as this one (a security-hardening pass whose
  migration files were seemingly never committed). Worth a dedicated
  reconciliation sweep at some point — compare `list_migrations` output
  against `supabase/migrations/` file-by-file for that date range — but out
  of scope for this entry.
- `delete_document_cascade` still doesn't clean up (or check)
  `client_stage_documents`, `generated_documents.source_document_id`, or
  `governance_document_deliveries` before its final `DELETE FROM
  documents`. All three have non-cascading (`NO ACTION`) foreign keys, so a
  document referenced by any of them would currently fail the whole RPC
  with a raw Postgres FK-violation error rather than a clean message.
  Worth a small follow-up if that's ever hit in practice.
