Add a database trigger that automatically removes rows from `public.document_stage_links` whenever a document's primary `stage` is updated to a value that already exists as an additional stage link. This ensures the two association mechanisms never overlap.

## What will be built

A single Postgres trigger and supporting function:

- `public.sync_document_stage_links_on_primary_change()` — `SECURITY DEFINER` function with `search_path = ''` that deletes any `document_stage_links` row where `document_id = NEW.id` and `stage_id = NEW.stage`.
- `trg_sync_document_stage_links_on_primary_change` — `AFTER UPDATE OF stage ON public.documents` trigger that fires only when `NEW.stage` is non-null and has changed from `OLD.stage`.

## Why this covers all write paths

Because the trigger is attached to the `documents` table itself, it fires regardless of which UI or RPC updates `documents.stage` — current dialogs, future dialogs, bulk updates, or migrations.

## Out of scope

- No changes to the three provisioning RPCs, the `document_stage_links` table structure, or either frontend file.
- No reverse-direction guard (adding an additional stage equal to the current primary) — already blocked client-side by `DocumentAdditionalStagesField`.

## Verification steps

1. Pick a document that has an existing `document_stage_links` row (e.g. one of the 37 linked to stage 1114). Run `UPDATE public.documents SET stage = 1114 WHERE id = <document_id>;`. Confirm the matching `(document_id, 1114)` link row is deleted.
2. Update a different document's `stage` to an unrelated stage with no additional link. Confirm no `document_stage_links` rows are touched for any other document.
3. Run `SELECT pg_get_functiondef('public.sync_document_stage_links_on_primary_change'::regprocedure);` and confirm it shows `SECURITY DEFINER` and `SET search_path = ''`.

## Rollback

```sql
DROP TRIGGER IF EXISTS trg_sync_document_stage_links_on_primary_change ON public.documents;
DROP FUNCTION IF EXISTS public.sync_document_stage_links_on_primary_change();
```