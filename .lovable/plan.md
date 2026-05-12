# Phase 3 — Code-only migration to `relationship_role`

Phases 1 (trigger) and 2 (data backfill) are live. The legacy boolean `primary_contact` is now a derived mirror of `relationship_role` (kept in sync by `sync_primary_contact_on_role`). Phase 3 rekeys remaining read paths to query the canonical column directly.

No DB migration. Code-only. Backward-compatible because the trigger guarantees the boolean and the role agree for every role-bearing row going forward; the 6 NULL-`relationship_role` legacy rows are intentionally not surfaced as contacts by either system.

---

## Files changed

### 1. `supabase/functions/bulk-send-invitations/index.ts` (line 133)
- Replace `.eq("primary_contact", true)` with `.eq("relationship_role", "primary_contact")`.
- Comment on line 115 left as-is (it reads "primary_contact tenant_users row" which is still semantically correct). Skip-reason string `"no_primary_contact"` (line 157) left as-is — it is part of the response audit contract.

### 2. `supabase/functions/send-email-graph/index.ts` (line 190)
- Replace `.eq("primary_contact", true)` with `.eq("relationship_role", "primary_contact")`.

### 3. `supabase/functions/send-composed-email/index.ts` (line 85)
- Replace `.eq("primary_contact", true)` with `.eq("relationship_role", "primary_contact")`.

### 4. `src/components/audit/workspace/SendPreliminarySummaryDialog.tsx` (line 77)
- Replace `.eq('primary_contact', true)` with `.eq('relationship_role', 'primary_contact')`.

### 5. `src/contexts/ClientTenantContext.tsx`
- `TenantUserRow` (lines 6–11): drop `primary_contact` and `secondary_contact`; add  
  `relationship_role: 'primary_contact' | 'secondary_contact' | 'user' | 'academy_user' | null;`
- SELECT (line 182): `"tenant_id, access_scope, relationship_role"`.
- `isContact` derivation (line 204):
  ```ts
  const isContact =
    tenantUser.relationship_role === 'primary_contact' ||
    tenantUser.relationship_role === 'secondary_contact';
  ```
- `canAccessClientPortal` and `canManagePortalUsers` keep the `fullScope && isContact` formula. `isAcademyOnly` unchanged.

### 6. `src/contexts/__tests__/ClientTenantContext.test.tsx`
- Update `TURow` to `{ tenant_id; access_scope; relationship_role }`.
- Rewrite the existing five test fixtures to use `relationship_role`.
- Final test set covers all five gating states:
  1. `relationship_role:'primary_contact'` + `access_scope:'full'` → portal=true, manage=true, academyOnly=false.
  2. `relationship_role:'secondary_contact'` + `access_scope:'full'` → portal=true, manage=true, academyOnly=false.
  3. `relationship_role:'user'` + `access_scope:'full'` → portal=false, manage=false, academyOnly=false (new case).
  4. `relationship_role:'academy_user'` + `access_scope:'academy_only'` → portal=false, manage=false, academyOnly=true.
  5. `relationship_role:null` + `access_scope:'full'` → all three false (defensive).
- Keep the resilient-resolution and multi-row-defensiveness tests; only their fixtures change to `relationship_role`.

---

## Out of scope (explicitly not touched)

- `src/hooks/use-client-tenant-users.ts` ordering.
- `src/contexts/ClientPreviewContext.tsx` — already reads both fields and OR-s them; harmless.
- `src/components/AdminInviteUserDialog.tsx` — already prefers `relationship_role` with legacy boolean fallback; the fallback is still useful for the 6 NULL rows.
- `src/pages/ClientDetail.tsx` line 200 (`.eq('secondary_contact', true)`) — not in the user's list.
- `supabase/functions/invite-user`, `cancel-invite`, `resend-invite`, `provision-m365-user` — they already write/check `relationship_role` correctly; the residual `primary_contact: …` writes feed the trigger and are part of the legacy mirror.
- All RLS policies, FKs, partial unique indexes (`uniq_tenant_one_primary_contact`, `tenant_users_one_secondary`), `src/integrations/supabase/types.ts`, and any migration.

---

## Audit / risk review

- **Behavioural parity:** Post-Phase-2, the only rows where the legacy boolean and the role disagree are the 6 `relationship_role IS NULL` rows. None of those rows would have been returned by the old boolean filters either (their `primary_contact` is `false`), so each rekey returns the same set. ✅
- **Trigger interaction:** No write paths change here; no risk to `sync_primary_contact_on_role` or the unique partial indexes. ✅
- **RLS:** All four edge functions run with the service-role client; the rekey is a column swap on equally-RLS-exempt queries. The frontend SELECT on `tenant_users` already runs under the user's session and the column is exposed by existing policies (`AdminInviteUserDialog` selects it). ✅
- **FK constraints:** Untouched. ✅
- **Type safety:** `tenant_users.relationship_role` is present in `src/integrations/supabase/types.ts`; no regenerate needed.
- **Audit trail:** No data mutations. The `no_primary_contact` outcome string in `bulk-send-invitations` is preserved so the audit log stays comparable across runs.
- **Backward compatibility:** Booleans remain populated by the trigger; any other consumer still on the legacy column keeps working.

## Risk: Low

- Single-line query changes in 4 server/client read sites + one context type/SELECT/derivation swap.
- Test suite expanded to cover the new canonical states explicitly.
- No deploy-order dependency (Phase 1 trigger already keeps booleans coherent if anything is rolled back).

## Verification after implementation

1. `vitest run src/contexts/__tests__/ClientTenantContext.test.tsx`.
2. Type-check passes (auto by harness).
3. Manual smoke: load client portal as primary contact, secondary contact, plain user, academy user — gating matches the matrix above.
