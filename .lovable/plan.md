# Multi-Stage Document Association — Implementation Plan

Additive change. `documents.stage` remains the primary/single-select "template association" as today. A new `document_stage_links` table stores **extra** stage associations. Effective stage set for a document = `documents.stage` ∪ `document_stage_links.stage_id`.

## Step 1 — Migration: `document_stage_links` (DDL only)

Single migration containing the exact DDL from the brief:

- `CREATE TABLE public.document_stage_links` with `id bigint IDENTITY PK`, `document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE`, `stage_id integer NOT NULL REFERENCES stages(id) ON DELETE CASCADE`, `created_at timestamptz DEFAULT now()`, `created_by uuid REFERENCES auth.users(id)`, `UNIQUE (document_id, stage_id)`.
- Two btree indexes on `document_id` and `stage_id`.
- `ENABLE ROW LEVEL SECURITY`.
- Two policies (staff-only via `is_super_admin_safe()` / `is_vivacity_team_safe()`): `_select` and `_staff_write` (`FOR ALL`).
- `REVOKE ALL … FROM PUBLIC`; `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated`; `GRANT ALL … TO service_role`.

Row/lock impact: pure DDL, no existing rows touched. Only new object creation.

## Step 2 — Migration: one-time backfill (DML only, separate migration)

Kept in its own migration per project rule (DDL and DML separated):

```sql
INSERT INTO public.document_stage_links (document_id, stage_id)
SELECT id, 1114 FROM public.documents WHERE stage = 1125
ON CONFLICT (document_id, stage_id) DO NOTHING;
```

Idempotent. Row/lock impact: inserts ≈37 rows into a brand-new empty table; only touches `documents` via a SELECT — no locks on it. Verified via pre-flight `SELECT count(*) FROM documents WHERE stage = 1125` immediately before applying; expected count matches the number of rows inserted.

## Step 3 — Migration: rewrite 3 provisioning functions

Retrieve current bodies via `pg_get_functiondef(...)` for each of the three, then `CREATE OR REPLACE FUNCTION` with **only** the documented change and all existing settings preserved (`SECURITY DEFINER`, `SET search_path = ''`, existing parameters, existing grants, all other logic byte-identical). After replacement re-run `pg_get_functiondef` and diff to confirm the only change is the added `OR EXISTS` clause. Then `REVOKE ALL ON FUNCTION … FROM PUBLIC` and `GRANT EXECUTE … TO authenticated, service_role` matching what was there before.

Change in each function — everywhere the pattern `FROM public.documents d WHERE d.stage = <stage_expr>` appears, replace with:

```sql
FROM public.documents d
WHERE d.stage = <stage_expr>
   OR EXISTS (
     SELECT 1 FROM public.document_stage_links dsl
     WHERE dsl.document_id = d.id
       AND dsl.stage_id = <stage_expr>
   )
```

- **3a. `publish_stage_version(p_stage_id …)`** — two occurrences: snapshot-building query, and the `document_instances` backfill INSERT. Both get the clause with `<stage_expr>` = `p_stage_id`.
- **3b. `repair_package_instance_stages(...)`** — one occurrence inside the `document_instances` INSERT loop. `<stage_expr>` = `v_stage.stage_id::integer`.
- **3c. `seed_stage_instances_from_template(...)`** — one occurrence. `<stage_expr>` = `v_stage.stage_id::integer`.

Row/lock impact: function replacement takes a brief `AccessExclusiveLock` on the function OID only; no table locks until the function is next invoked. No behavioural change for stages that have no additional links (the `OR EXISTS` is a no-op when the table is empty for that stage).

## Step 4 — Frontend: "Additional Stages" multi-select

Two surfaces, same behaviour, same helper hook. Edit-only (requires a `document_id`).

### Files edited

1. `src/pages/ManageDocuments.tsx` — metadata step of the create/edit form. Field appears **only in edit mode** directly under the existing "Stage (Template Association)" single-select.
2. `src/components/governance/GovernanceDocumentEditDialog.tsx` — same field placement, directly under the existing primary Stage select.

### Files added

3. `src/hooks/useDocumentAdditionalStages.ts` (new) — small React Query hook exposing:
   - `useDocumentAdditionalStages(documentId)` → `{ stageIds: number[], isLoading }`, fetches `select stage_id from document_stage_links where document_id = $1`.
   - `useSaveDocumentAdditionalStages()` → mutation that takes `{ documentId, primaryStageId, selectedStageIds }`, diffs against currently-persisted rows, and issues one `insert` (added) and one `delete` (removed) against `document_stage_links`. `primaryStageId` is filtered out of `selectedStageIds` before diffing so the same stage can never appear in both places.

### UI behaviour

- Multi-select uses the existing shadcn `MultiSelect` / `Command` pattern already used elsewhere in these two files (whichever is local convention — verified per file before wiring).
- Options: all stages **except** the current primary `documents.stage` value (which is disabled/hidden from the list). If the primary changes in the same edit session, the excluded option updates accordingly.
- On dialog open: pre-select current `document_stage_links` rows for this document.
- On save: form-submit runs the existing primary-stage update first (unchanged); then the mutation from (3) diffs and applies. Failure of the additional-stages mutation surfaces a toast but does **not** roll back the primary save (documented in a code comment; matches how sibling metadata fields already behave in this form).
- No effect on document creation flow — field is hidden until `selectedDocId` (edit mode) exists.

### Out of scope (explicit)

- No change to `documents.stage` single-select semantics.
- No cascade/cleanup logic when a link is removed (deferred).
- No edge function changes (`deliver-governance-document`, `import-sharepoint-template`, etc.).

## Verification checklist (run after each step)

After Step 1: `\d public.document_stage_links` shows the table + both indexes + RLS enabled; `SELECT count(*) FROM public.document_stage_links` returns 0.

After Step 2: `SELECT count(*) FROM public.document_stage_links WHERE stage_id = 1114` equals `SELECT count(*) FROM public.documents WHERE stage = 1125` (expected ≈37 — confirmed live before applying).

After Step 3 for each function:
- `pg_get_functiondef(oid)` still contains `SECURITY DEFINER` and `SET search_path TO ''`.
- Diff vs. pre-change definition shows **only** the added `OR EXISTS` block(s).
- `SELECT publish_stage_version(1114)` and `SELECT publish_stage_version(1125)` each return a snapshot whose documents array contains all 37 shared documents.

After Step 4: opening the edit dialog for one of the 37 documents shows the correct pre-selected stage in "Additional Stages"; toggling and saving round-trips correctly; the primary stage is never a selectable option in "Additional Stages".

## Risk assessment

- **Function replacement drift** — mitigated by `pg_get_functiondef` diff before and after; only the `OR EXISTS` block is allowed to change.
- **Backfill scope** — narrowly targets `stage = 1125`; idempotent via `ON CONFLICT DO NOTHING`; safe to re-run.
- **Performance** — `OR EXISTS` against an indexed `(document_id, stage_id)` unique key is O(log n) per document; snapshot queries currently scan `documents` filtered by `stage`, which stays the primary predicate. Negligible impact until the table grows large.
- **RLS** — table is staff-only (matches how these documents are managed today); no client-portal exposure surface added.
- **Rollback** — Step 1/2 rollback: `DROP TABLE public.document_stage_links CASCADE` (also clears backfill). Step 3 rollback: re-apply captured pre-change `pg_get_functiondef` output for each function. Step 4 rollback: revert the two frontend files + delete the new hook file.

## Decisions needed before executing

1. **Live count confirmation** — I'll query `SELECT count(*) FROM public.documents WHERE stage = 1125` immediately before Step 2 and pause if it isn't 37; do you want me to abort or proceed on any mismatch?
2. **`document_stage_links.created_by` on backfill** — leave `NULL` for the 37 backfilled rows (they aren't user-initiated), or stamp Angela's SuperAdmin uuid? Default: leave NULL.
3. **Multi-select UX component** — use `MultiSelect` (shadcn combobox pattern) or a checklist-in-Popover? Default: match whatever pattern the target file already uses (they may differ), so both feel native to their surface.
4. **Ordering of writes on save** — proposed: primary stage first (unchanged existing path), then additional-stages diff. Confirm this is the desired ordering (vs. batching both into one transactional RPC — which would be a bigger scope change).
