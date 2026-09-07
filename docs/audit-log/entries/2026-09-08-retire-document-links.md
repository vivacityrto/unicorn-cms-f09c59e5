# Retire the never-adopted document_links / document_link_audit tables

**Date:** 2026-09-08

**Packet:** Phase 2.6 stabilization Packet P6-B (dead-code backend retirement follow-up)

**Scope:** two production tables, one trigger function, one Edge Function's source (deploy-side removal disclosed as a follow-up)

**Hosted state changed:** yes — schema (table/function drop)

## Decision

Carl explicitly authorized retiring `document_links` and its dependent
`document_link_audit` after the frontend UI that wrote to them
(`LinkedDocumentsList.tsx`, `SharePointDocumentPicker.tsx`,
`useDocumentLinks.tsx`) was already retired 2026-09-07 (Phase 2.6 P6-B — see
`docs/kb/reference/dead-code-feature-consolidation-investigation-2026-09-04.md`
§3.2 "SharePoint document-link UI"). The live document-stage-linking feature
uses the differently-named `document_stage_links` table (678 real rows) and
was never built on `document_links` — this is a superseded-from-day-one
feature, not merely orphaned.

Confirmed before this migration:

- `document_links`: 0 rows, ever.
- `document_link_audit` (its only FK-dependent child table): 0 rows, ever.
- No `cron.job` references either table or the `link-sharepoint-document`
  Edge Function.
- No other table's FK references either table (checked `pg_constraint`).
- `update_document_links_updated_at` is a trigger function used only by
  `document_links`'s own `updated_at` trigger.
- `merge_tenants()` references both table names inside a generic, defensive
  per-table loop wrapped in `BEGIN/EXCEPTION WHEN OTHERS` — it will log a
  harmless `<table>_error` entry for these two names on any future tenant
  merge instead of failing. Not modified by this change since it does not
  break; disclosed here rather than silently left for someone to rediscover.

A related, adjacent candidate — `calculate_compliance_score` /
`v_compliance_score_latest` / `compliance_score_snapshots` — was
investigated in the same session and explicitly **not** retired: it's a
real, sophisticated composite scoring engine (not a stub) that Carl
confirmed is earmarked for a future client health feature, alongside
`useClientAICompanion.ts`. See the dead-code register's §3.2 "Compliance-score
island" entry for the full rationale. Out of scope for this migration.

## Implementation

`supabase/migrations/20260908010000_retire_document_links.sql`:

- no-ops if `document_links` is already absent in the target environment;
- refuses to act if either target table has any rows;
- drops `document_link_audit` (child), then `document_links` (parent), then
  `update_document_links_updated_at()`; and
- raises if either table still exists afterward.

This migration needed no `migration-safety-allowlist.json` entry —
`scripts/audit-migrations.mjs`'s risk categories cover production URLs,
cron schedule/unschedule, HTTP calls, and `INSERT`/`UPDATE`/`DELETE`/
`TRUNCATE` data mutations, none of which this pure-DDL migration contains.

Also removed from the repo: `supabase/functions/link-sharepoint-document/`
(source) and its `supabase/config.toml` entry. **Known gap, disclosed
rather than silently left:** no `delete_edge_function` MCP tool was
available this session (same limitation as `extract-suggest-title`'s
retirement, see the dead-code register's Bounded clone queue entry) — the
deployed Supabase function will remain listed as ACTIVE but is now
unreachable from any code path (zero remaining callers). Manually deleting
it via the Supabase dashboard is a disclosed follow-up, not done here.

## Postflight

- `information_schema.tables` no longer lists `document_links` or
  `document_link_audit`.
- `update_document_links_updated_at` no longer exists in `pg_proc`.
- `document_stage_links` (the live, unrelated table) still has 678 rows,
  confirming it was untouched.
- `calculate_compliance_score`, `v_compliance_score_latest`, and
  `compliance_score_snapshots` are unchanged (deliberately out of scope).

## Open questions parked

- Manually deleting the now-unreachable `link-sharepoint-document` Edge
  Function via the Supabase dashboard — not done this session.
- `merge_tenants()`'s table list still names `document_links` and
  `compliance_score_snapshots`; the former will now always log a benign
  `document_links_error` entry on every future tenant merge. Harmless (the
  function's own exception handling absorbs it), not fixed here — cleaning
  up that list is a separate, low-priority follow-up.
