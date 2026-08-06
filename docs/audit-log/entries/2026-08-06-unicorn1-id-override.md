# Audit: 2026-08-06 — unicorn1-id-override

**Trigger:** ad-hoc
**Scope:** Added `tenants.unicorn1_id` column + auto-populate trigger to unicorn-cms-f09c59e5 (hand-applied hotfix, not routed through Lovable). Did not review any other schema areas.

## Findings
- The Unicorn 1 redirect buttons (Client Detail's `TenantTimeTrackerBar`, Client Portal's `CompliancePulseBanner`) built `https://unicorn-cms.com.au/clients/{tenants.id}` directly, with no override field. This only worked for tenants imported 1:1 from Unicorn 1 via `import-unicorn1-client` (which sets `tenants.id = client_id`).
- Carl confirmed Unicorn 1's own auto-increment sequence has drifted 1 ahead of where it used to line up with Unicorn 2 tenant creation, so tenants created organically in Unicorn 2 (not imported) have no valid corresponding Unicorn 1 record at their own `id`.

## KB changes shipped
- no changes

## Codebase observations (read-only)
- unicorn-cms-f09c59e5 @ `bcf6821306b6f81a963941d742f0e533b4920d25` (branch `hotfix/unicorn1-id-override`, PR #181, not yet merged): added nullable `tenants.unicorn1_id`; `BEFORE INSERT` trigger `trg_set_default_unicorn1_id` defaults it to `id + 1` when not explicitly supplied; `import-unicorn1-client` edge function patched to explicitly set `unicorn1_id = client_id` on import so the drift-correction default doesn't misfire on genuine imports (which need no offset). New "Unicorn 1" panel added to the Client Detail Integrations tab for manual override. Migration `20260806050000_add_unicorn1_id_to_tenants.sql` applied directly to prod Supabase (`yxkgdalkbrriasiyyrwk`) same session, ahead of the PR merging.

## Decisions
- None drafted/resolved this session.

## Open questions parked
- Whether the +1 drift is a one-time historical event or an ongoing/recurring issue in Unicorn 1 wasn't established — if it recurs or the offset changes, the trigger's fixed `+1` will need revisiting.

## Tag
audit-2026-08-06-unicorn1-id-override
