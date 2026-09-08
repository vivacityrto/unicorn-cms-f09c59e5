# Use clients_legacy.tenant_id for Excel generation's legacy-client lookup

**Date:** 2026-09-08

**Packet:** Phase 2.6 stabilization Packet P4-D, L10 item #15

**Scope:** frontend-only, 1 file — no migration, no schema change

**Hosted state changed:** no — this is a code-only fix; no data or DB objects touched

## Decision

Carl authorized continuing the P4-D queue with whatever item made sense
next. The L10 register flagged item #15 as blocked on "someone who knows
the intended legacy-mapping path" — `tenants.unicorn1_id` is a `bigint`,
not the string `client_legacy_id` the Excel-generation edge function
expects, and `tenants` has no `client_legacy_id` column at all (that name
only exists on `excel_generated_files`/`generated_documents`, unrelated
columns on different tables).

Investigating the live schema (not guessing) found an unambiguous answer:
`clients_legacy.tenant_id` is a `bigint` column that is a direct FK to
`tenants.id` — confirmed via `information_schema.columns` and, for
reliability, `select count(*), count(tenant_id), count(distinct
tenant_id) from clients_legacy` returned `11, 11, 11`: every row has a
`tenant_id`, and it's 1:1 (no tenant has more than one legacy row). This
is a much cleaner join than the L10 doc's implied path through
`unicorn1_id` (which is a different id space entirely — the old Unicorn1
system's own numeric row id, not a foreign key into this table). Also
confirmed via `pg_policy` that `clients_legacy`'s SELECT policy already
covers super admin, Vivacity staff, and the tenant's own users (via
`has_tenant_access_safe`) — no RLS change needed.

## Implementation

`GeneratedDocumentsTab.tsx`'s `handleExcelGenerate`: replaced
`supabase.from('tenants').select('client_legacy_id').eq('id',
tenantId).single()` with `supabase.from('clients_legacy').select('id').eq
('tenant_id', tenantId).maybeSingle()`, passing the resulting `id` (a real
uuid, `clients_legacy.id`) as `clientLegacyId`. Used `maybeSingle()` (not
`single()`) deliberately — `clients_legacy` is a small, migrated-data-only
table (11 rows total), so most tenants correctly have no matching row,
which should resolve to `undefined` rather than throw.

`TenantDocuments.tsx` — the L10 doc's other documented occurrence of this
same bug — was not touched here: it was independently retired as dead
code in a separate, earlier PR (`479972a21`, "fix: fix invalid-relationship
reads, retire dead Tenant Documents pages"). Confirmed via `git log
--diff-filter=D -- src/pages/TenantDocuments.tsx` before starting, since a
stale local checkout had briefly suggested otherwise.

## Postflight

- `npm run typecheck`, `npm run test:frontend` (321 passed, 15 skipped —
  one run hit 2 unrelated pre-existing test timeouts,
  `addin-settings-shell.test.tsx` and `authentication.test.tsx`, neither
  touching this change; an immediate clean rerun confirmed transient),
  `npm run build` — all clean.
- `LINT_RATCHET_BASE=origin/main node scripts/lint-ratchet.mjs` — no
  regression in the one changed file.
- Live verification pending — recorded here once done.

## Open questions parked

- L10 items #10, #18 remain in the P4-D queue. #10 (calendar invites) is
  worse than the L10 doc described: even fixing `calendar_events`'
  NOT NULL columns would not produce a working Outlook invite, since
  `sync-outlook-calendar` has no `action: 'create'` handler at all — it
  only syncs *from* Outlook inbound, never posts a new event *to*
  Outlook. That's real new-feature work (a Graph API outbound create-event
  call, likely needing a write-scope OAuth permission this integration may
  not currently have), not a bounded bug fix — flagged for Carl rather
  than picked up here.
