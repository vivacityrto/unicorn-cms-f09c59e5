Fix three Tier 2 provisioning paths that currently seed/copy documents by primary stage only, missing documents linked through `document_stage_links`.

Changes

1. Database function `copy_stage_template_to_package`
   - Update the `package_stage_documents` INSERT's document source query.
   - Keep `WHERE d.stage = p_stage_id` and add an `OR EXISTS` clause against `public.document_stage_links`.
   - Leave the three sibling inserts (`package_staff_tasks`, `package_client_tasks`, `package_stage_emails`) and the `package_stages` update untouched.
   - Preserve existing `SECURITY DEFINER` and `SET search_path TO 'public'`.

2. `src/hooks/useStageTemplateContent.tsx` — `copyTemplateToOverrides`
   - Replace the single `documents` query `.eq('stage', stageId)` with a two-step union: query `document_stage_links` for `stage_id = stageId`, then query `documents` with `.or('stage.eq.X,id.in.(...)')`, falling back to `.eq('stage', stageId)` when no additional IDs exist.
   - The rest of the function (inserts into `package_staff_tasks`, `package_client_tasks`, `package_stage_emails`, `package_stage_documents`) remains unchanged.

3. `supabase/functions/import-unicorn1-client/index.ts`
   - Replace the direct `documents.eq('stage', stageId)` query with the same union pattern: fetch `document_id`s from `document_stage_links`, then build an `.or(...)` or `.eq(...)` query against `documents`.
   - The per-template `document_instances` insert loop is unchanged.

Verification

- Call `copy_stage_template_to_package` for stage `1114` against a test package and confirm `package_stage_documents` receives all 210 documents (173 primary + 37 linked), not just 173.
- Trigger `copyTemplateToOverrides` for a stage/package combo involving stage `1114` or `1125` and confirm the resulting `package_stage_documents` rows include the linked documents.
- For `import-unicorn1-client`, confirm the query logic returns the union by running the equivalent SQL directly against the database.

Out of scope

- No changes to `package_staff_tasks`, `package_client_tasks`, or `package_stage_emails` inserts in `copy_stage_template_to_package`.
- No changes to `package_stage_documents` structure or the `use_overrides`/`last_synced_at` update.
- No other changes to `import-unicorn1-client` or `useStageTemplateContent.tsx`.