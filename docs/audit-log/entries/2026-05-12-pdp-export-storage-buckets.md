# Audit: 2026-05-12 — pdp-export-storage-buckets

**Trigger:** planned — prerequisite infrastructure for the `pdp-export`
Edge Function (Prompt 11 / F15)  
**Scope:** Two new Storage buckets and five new `storage.objects` RLS
policies. No schema, FK, trigger, or code changes.  
**Session owner:** Angela Connell-Richards  
**Lead dev:** Carl  
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- Neither `doc-templates` nor `generated-docs` existed; no name
  collisions with any of the 25 existing buckets.
- `is_vivacity_team_safe()` has no zero-arg overload — all policies
  call `public.is_vivacity_team_safe(auth.uid())` explicitly (matches
  existing codebase convention).
- Path-segment join from `generated-docs` SELECT to `pdp_cycles` was
  evaluated and rejected: per-row cast cost, cast fragility on non-numeric
  paths, and tight coupling to path conventions outweigh the benefit.
  Manager and tenant-admin downloads route through `pdp-export`-minted
  signed URLs instead, consistent with `audit-reports` /
  `academy-certificates` pattern.
- Service role bypasses RLS unconditionally — no INSERT/UPDATE/DELETE
  policies needed on `generated-docs`; browser writes denied by default.

## DB changes shipped

Migration applied to `yxkgdalkbrriasiyyrwk` on 12 May 2026:

**Buckets created:**

| Bucket | Public | Size limit | MIME |
|--------|--------|------------|------|
| `doc-templates` | false | 52 428 800 (50 MB) | unrestricted |
| `generated-docs` | false | 10 485 760 (10 MB) | DOCX only |

**Policies added (5, all on `storage.objects`):**
- `doc-templates: staff select` — SELECT, `is_vivacity_team_safe(auth.uid())`
- `doc-templates: staff insert` — INSERT, same guard
- `doc-templates: staff update` — UPDATE, same guard (USING + WITH CHECK)
- `doc-templates: staff delete` — DELETE, same guard
- `generated-docs: owner or staff select` — SELECT, path owner
  (`storage.foldername(name)[1]='pdp'` AND `[2]=auth.uid()::text`) OR
  Vivacity staff

No INSERT/UPDATE/DELETE policies on `generated-docs` — service role
writes freely; browser writes denied by RLS default.

Rollback: documented in migration comment; drops 5 policies and both
bucket rows. Safe to run at any time (net-new, unreferenced).

**Post-deploy verification (live DB confirmed):**
- Both buckets present with correct config ✅
- 5 policies present with correct expressions ✅
- No other storage policies modified ✅

## KB changes shipped

- `unicorn-kb @ 925d5f6` (branch `kb/pdp-follow-up-prompts`, PR #30 open):
  F13/F14 marked done; codebase facts corrected (nav config pointer,
  lesson-completion trigger clarification).

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ dae6be58`: migration committed by Lovable as
  "Applied auth bucket migration". `pdp-export` Edge Function not yet
  deployed — that is F15 (next session).

## Decisions

- `generated-docs` SELECT scoped to path owner + Vivacity staff only;
  manager/tenant-admin access via signed URLs from Edge Function. Accepted.
- `doc-templates` size limit: 50 MB (52 428 800). Accepted.
- `generated-docs` MIME: DOCX-only. Accepted.
- No zero-arg `is_vivacity_team_safe()` overload added. Accepted.

## Open questions parked

- **PDF export from `generated-docs`** — if a PDF render option is added
  to `pdp-export` later, `allowed_mime_types` needs a one-line ALTER.
- **Orphaned objects** — if a `pdp_cycles` row is deleted, its
  `generated-docs` objects are not cascade-deleted. Low risk now; worth a
  cleanup step when the PDP archival flow is built.
- **DOCX template authoring** — `doc-templates/pdp/pdp-cycle-export-v1.docx`
  must be uploaded manually before F15 can produce output. Brand spec is
  in `handoffs/pdp-lovable-prompts.md` under Prompt 11.

## Tag

`audit-2026-05-12-pdp-export-storage-buckets`
