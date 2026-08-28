# Audit: 2026-08-28 — drop-orphaned-bulk-upload-ai-analysis-rpcs

**Trigger:** ad-hoc, following a hand-applied hotfix (removal of the Stage Documents bulk-upload-with-AI-metadata feature)
**Scope:** the four Postgres RPCs the removed feature depended on. Did not look at `documents.ai_status`/`ai_confidence_score`/etc. columns or the `document_ai_audit` table beyond confirming they should stay — those are out of scope for this entry (still read by the live `AIConfidenceBadge.tsx`).

## Findings

- The frontend removal of `BulkUploadWithMetadataDialog.tsx`, `AIAnalysisReviewDialog.tsx`, `useDocumentAIAnalysis.tsx`, and `useDocumentAIConfidence.tsx` (PR #438, same day) left four RPCs with zero remaining callers: `apply_document_ai_analysis`, `approve_document_ai_suggestions`, `reject_document_ai_suggestions`, `bulk_create_documents_with_versions`.
- Confirmed via `pg_proc.prosrc` scan: no other Postgres function references any of the four by name.
- Confirmed via `cron.job` scan: no cron job references any of the four.
- Confirmed via repo grep (`src/`, `supabase/functions/`): the only remaining reference was the auto-generated `src/integrations/supabase/types.ts`, a type definition, not a real caller.
- Before dropping, the underlying `document_ai_audit` table was independently confirmed (during the earlier dead-code investigation) to have zero rows, ever — the feature these RPCs served never actually ran to completion in production at any point in its life.
- `documents.ai_status`, `ai_confidence_score`, `ai_category_confidence`, `ai_description_confidence` columns are **not** touched — `AIConfidenceBadge.tsx` still reads them directly for historical display of already-analyzed documents (there are none with non-default status in production, but the column contract must remain intact regardless).
- `document_ai_audit` table is **not** dropped in this pass — flagged as a candidate for a future schema-cleanup pass, not bundled into this entry.

## KB changes shipped

- No changes.

## Code changes (if this entry accompanies one)

- Migration `drop_orphaned_bulk_upload_ai_analysis_rpcs` applied directly to the hosted Supabase project via MCP (`apply_migration`): drops all four RPCs listed above with `DROP FUNCTION IF EXISTS`, exact-signature-matched via `pg_get_function_identity_arguments` first (each had exactly one overload).
- Frontend removal itself: `docs/dead-code-cleanup-plan-2026-08-27.md`, "§3 follow-up" section, and PR #438.

## Decisions

- Carl explicitly confirmed (in-session) to proceed with dropping these RPCs, after being told this constitutes a schema change distinct from the earlier frontend-only git deletion.

## Open questions parked

- `document_ai_audit` table itself (zero rows, ever) — worth a future schema-cleanup migration to drop, once nobody has any remaining interest in the historical shape. Not urgent; flagged only.
