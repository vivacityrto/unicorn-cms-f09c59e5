# Audit: 2026-04-29 — `client_audits.audit_type` CHECK constraint gap

**Author:** Brian  
**Trigger:** ad-hoc — `due_diligence_combined` audit creation was silently blocked at the DB layer  
**Scope:** `client_audits` schema (CHECK constraint on `audit_type`), all frontend consumers of `audit_type`, `NewAuditModal.tsx` wizard, `useTenantsBasic` / `ManageTenants.tsx` pagination removal (bundled fix)  
**Codebase verified at:** `unicorn-cms-f09c59e5@732d788f`  
**Session start (local HEAD):** `unicorn-cms-f09c59e5@c08d8cd2` — was behind `origin/main`; pulled multiple times during session as fixes landed

---

## Context

The `client_audits` table's `audit_type` CHECK constraint did not include `'due_diligence_combined'`. The frontend `AuditType` union had carried that value since the audit wizard was extended, and all UI components were already written to handle it correctly — the DB gate was the only blocker. Any attempt to create a Combined RTO + CRICOS Due Diligence audit would fail with a PostgreSQL constraint violation. Because the error surfaced only as a generic Sonner toast (`Failed to create audit`), the gap was not immediately obvious to users.

Lovable queried `pg_constraint` to confirm the constraint definition before drafting the fix.

---

## Finding 1 — `client_audits` CREATE TABLE not in any tracked migration

The `client_audits` table was created directly in the Supabase DB — not via any migration file in `supabase/migrations/` and not via any `sql-setup/` script. All 897 migrations were searched; only three reference `client_audits`:

| Migration | What it does |
|-----------|-------------|
| `20260414091949` | Data patch — DELETE / UPDATE a single row |
| `20260414224603` | Creates `v_audit_schedule` view — reads from the table |
| `20260415025914` | Enables RLS on the table — no schema change |

None creates or alters the table structure. The authoritative schema exists only in the live Supabase DB. This means any future constraint widening, column addition, or index change must be delivered as a tracked migration — there is no SQL source of truth in the repo to refer back to.

---

## Finding 2 — Constraint allowed 6 values; frontend sent 7

The live constraint (`client_audits_audit_type_check`) before the fix:

```sql
CHECK (audit_type = ANY (ARRAY[
  'compliance_health_check', 'cricos_chc', 'rto_cricos_chc',
  'mock_audit', 'cricos_mock_audit', 'due_diligence'
]))
```

The `AuditType` union in `src/types/clientAudits.ts` defined 7 values — all 6 above plus `'due_diligence_combined'`. Every map that depends on `AuditType` (`AUDIT_TYPE_LABELS`, `AUDIT_TYPE_HUMAN`, `AUDIT_TYPE_TEMPLATE`, `AuditTypeBadge` colour map) already included `due_diligence_combined`. The insert path in `useCreateAudit` (`src/hooks/useClientAudits.ts:118`) passed `selectedCard.value` directly with no client-side validation against the DB constraint.

The `v_audit_schedule` view intentionally only tracks the three CHC types — due diligence audits are correctly excluded from the CHC schedule and required no change.

---

## Finding 3 — Two pre-existing frontend gaps (not caused by the constraint, not blocking)

Both gaps were identified during the blast-radius check, noted as cosmetic-only, and closed in follow-up Lovable prompts the same session.

### Gap A — `AuditsAssessments.tsx` filter dropdown incomplete

**State at discovery:** `src/pages/AuditsAssessments.tsx:115-118` had only three filter options (`compliance_health_check`, `mock_audit`, `due_diligence`). The remaining four `AuditType` values — `cricos_chc`, `rto_cricos_chc`, `cricos_mock_audit`, `due_diligence_combined` — were absent. Audits of those types were visible under "All Types" but could not be filtered specifically.

**Fix (`a2464926`, 29 Apr 2026):** Four `SelectItem` entries added in one commit. Scope: `AuditsAssessments.tsx` only, +4 lines, no state or data changes.

**Post-fix state:** All 7 `AuditType` values are now selectable filter options.

---

### Gap B — `research-audit-intelligence` edge function label map incomplete + label mismatch

**State at discovery:** The edge function's `AUDIT_TYPE_LABELS` (lines 26–32) covered only 5 legacy ASQA audit types (`initial_registration`, `re_registration`, `extension_to_scope`, `strategic_review`, `post_audit_response`). When called with any `client_audits` audit type — `compliance_health_check`, `due_diligence_combined`, etc. — the function fell back to the raw enum string. The raw string appeared in the Perplexity AI prompt and in the `**Audit Type:**` header line of every generated intelligence pack stored to `audit_intelligence_packs.summary_markdown`.

A blast-radius check confirmed: (a) `AUDIT_TYPE_LABELS` is read in exactly one place in the file (`const auditLabel = AUDIT_TYPE_LABELS[audit_type] || audit_type`), (b) `auditLabel` feeds only the AI prompt text and the report header — both staff-only surfaces, no client-facing exposure, (c) no other edge function has an equivalent label map, (d) no branching on `audit_type` values exists elsewhere in the file.

**Fix part 1 (`2c18696d`, 29 Apr 2026):** All 7 `AuditType` values added to the map:

```ts
compliance_health_check: "CHC",        // ← label was wrong — see Finding 4
cricos_chc:              "CHC — CRICOS",
rto_cricos_chc:          "CHC — RTO + CRICOS",
mock_audit:              "Mock Audit",
cricos_mock_audit:       "Mock Audit — CRICOS",
due_diligence:           "Due Diligence",
due_diligence_combined:  "Combined RTO + CRICOS Due Diligence",
```

**Fix part 2 (`732d788f`, 29 Apr 2026):** `compliance_health_check` label corrected from `"CHC"` to `"CHC — RTO"` — see Finding 4 below.

**Post-fix state:** All 12 keys present (5 legacy ASQA + 7 `AuditType`). Labels match `src/types/clientAudits.ts` exactly.

---

## Finding 4 — Label mismatch: `"CHC"` vs `"CHC — RTO"` across three maps

When Lovable added the 7 `AuditType` values to the edge function's `AUDIT_TYPE_LABELS` (Fix part 1 above), it chose `"CHC"` for `compliance_health_check`. A cross-map audit immediately after the pull found the label is not consistent across the codebase:

| Location | `compliance_health_check` label | Purpose |
|----------|--------------------------------|---------|
| `src/types/clientAudits.ts` (`AUDIT_TYPE_LABELS`) | `"CHC — RTO"` | **Canonical** — used by `AuditTypeBadge`, `ClientAuditReportsSection`, `buildPreliminaryAuditSummary` |
| `src/hooks/useClientAudits.ts` (`AUDIT_TYPE_HUMAN`) | `"Compliance Health Check"` | Audit title generation only — intentionally different |
| `src/pages/AuditsAssessments.tsx` (filter dropdown) | `"CHC"` | Filter chip label — short form, acceptable in context |
| `src/components/audit/NewAuditModal.tsx` (card labels) | `"SRTO 2025 — Annual CHC"` / `"SRTO 2025 only — CHC"` | Picker context only |
| `supabase/functions/research-audit-intelligence/index.ts` | `"CHC"` ← **before fix** | Staff-only report header and AI prompt |

The `"CHC"` label from the edge function was not client-facing (intelligence packs have no `report_client_visible` flag and no client portal route). However, it created an inconsistency between the report header (`**Audit Type:** CHC`) and every other staff UI surface where the same audit type displays as `CHC — RTO`.

**Fix (`732d788f`, 29 Apr 2026):** One-line change — `"CHC"` → `"CHC — RTO"` in the edge function map. Confirmed identical to canonical source.

**Why this happened:** The edge function cannot import from `src/` (Deno runtime). Lovable had no reference to compare against and chose a shorter form. There is no mechanism today that would catch this divergence automatically.

**Prevention rule (do not reproduce):**
> The edge function `AUDIT_TYPE_LABELS` is a manually maintained copy of the canonical map in `src/types/clientAudits.ts`. Whenever `AuditType` gains a new value OR an existing label is renamed in `src/types/clientAudits.ts`, the edge function map must be updated in the same Lovable prompt to match exactly. Before approving any Lovable fix that touches either map, cross-check every key against the other. The canonical source is always `src/types/clientAudits.ts`.

---

## Fix — Migration `20260428235523`

Delivered via Lovable. Drops and recreates the constraint with `'due_diligence_combined'` added:

```sql
ALTER TABLE public.client_audits
  DROP CONSTRAINT client_audits_audit_type_check;

ALTER TABLE public.client_audits
  ADD CONSTRAINT client_audits_audit_type_check
  CHECK (audit_type = ANY (ARRAY[
    'compliance_health_check', 'cricos_chc', 'rto_cricos_chc',
    'mock_audit', 'cricos_mock_audit',
    'due_diligence', 'due_diligence_combined'
  ]));
```

Rollback script included in the migration file (commented out). Scope: DB only — no RLS, trigger, index, view, or frontend changes in this migration.

Blast-radius check was completed before approval: all consumers of `audit_type` in both frontend and edge functions were verified. The change is purely additive; no existing rows or inserts were affected.

---

## Bundled fix — ManageTenants pagination removal (`useTenantsBasic` + `ManageTenants.tsx`)

Shipped in the same pull (`c08d8cd2 → 681758b0`), completing the pagination story opened in `2026-04-28-manage-tenants-perf-optimisation`:

- `useTenantsBasic` simplified from a paginated hook (`.range(page * pageSize, …)`) to a single `.range(0, 9999)` fetch. `keepPreviousData`, `hasMore`, and the page-accumulator `useEffect` in `ManageTenants.tsx` all removed.
- `ManageTenants.tsx` now renders all filtered tenants without slicing — `filteredTenants.map(...)` replaces `filteredTenants.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)`.
- Stat cards and row counts now reflect the full DB total, not a page-capped array. This closes the root cause of the April 2026 stat-card under-count (where `.range(0, 99)` capped `tenants.length` at 100 regardless of actual DB total).

**Residual note:** `.range(0, 9999)` is bounded by PostgREST's server-side `max_rows` setting. On standard Supabase this defaults to 1,000. At Vivacity's current tenant scale this is not a practical concern, but worth revisiting if tenant count grows materially.

---

## Bundled fix — `NewAuditModal.tsx` registration type detection

Three changes to the New Audit wizard, also in this pull:

1. **Registration field priority** — `registrationType` now derives from `rto_id` / `cricos_id` fields first, falling back to `tenant_profile.org_type` only when both registration fields are absent. Previously `org_type` was checked first, which could show the wrong card set for tenants whose `org_type` hadn't been kept in sync with their actual registration fields.

   **Edge case to monitor:** A tenant with `rto_id` set but both `cricos_id` and `profile_cricos_number` null — but `org_type = 'rto_cricos'` — will now see RTO-only audit cards. The new code short-circuits before reaching the `org_type` fallback. If any tenants are in this state, they would need their cricos ID fields populated.

2. **Card-clear effect scoped to Step 1** — previously nulled `selectedCard` on any step when registration type re-evaluated, silently breaking the Create button on Step 2/3. Now guarded with `if (step !== 1) return`.

3. **`handleSave` guard** — previously returned silently if `selectedCard` or `tenantId` was null. Now shows a descriptive toast and logs a console warning.

---

## Root cause summary

New audit types were added to the frontend `AuditType` union over time without corresponding migrations to widen the DB CHECK constraint. Because the `client_audits` table was not created via a tracked migration, there was no single SQL file to update — the constraint gap was invisible in code review. The fix establishes `20260428235523` as the first tracked migration that touches `client_audits` schema.

**Prevention:** Any future addition to `AuditType` in `src/types/clientAudits.ts` must be paired with a migration widening `client_audits_audit_type_check`. This pairing is not currently enforced by any CI check.

---

## KB changes shipped

- `unicorn-kb@55f5d30` — `reference/dev-guardrails.md`: Trap 6 (AuditType label map drift — three-map inventory, canonical source rule, CHC mismatch origin) and Trap 7 (AuditType DB constraint gap — verification SQL, current allowed-values list). PR: ComplyHub-ai/unicorn-kb#22.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5@681758b0` — constraint fix live; `due_diligence_combined` now insertable; ManageTenants pagination removed; NewAuditModal registration detection hardened.
- `unicorn-cms-f09c59e5@a2464926` — `AuditsAssessments.tsx` filter dropdown extended to all 7 `AuditType` values (Gap A closed).
- `unicorn-cms-f09c59e5@2c18696d` — edge function `AUDIT_TYPE_LABELS` extended with all 7 `AuditType` values; `AskVivPanel.tsx` gains `reasoning_tiers`, `governance`, `validation` fields (unrelated).
- `unicorn-cms-f09c59e5@732d788f` — edge function `compliance_health_check` label corrected from `"CHC"` to `"CHC — RTO"` (Gap B + Finding 4 closed).

---

## Decisions

None drafted or resolved this session.

---

## Open questions parked

- ~~Two frontend gaps (filter dropdown, edge function label) — closed this session.~~ Both resolved; see Findings 3 and 4.
- `AuditIntelligencePackPanel.tsx` (`src/components/tenant/AuditIntelligencePackPanel.tsx:32-38`) has its own local `AUDIT_TYPE_LABELS` covering only the 5 legacy ASQA types. This is a third copy of the map. The "Generate Intelligence Pack" dropdown therefore only offers legacy ASQA audit types — none of the current `client_audits` types appear. Confirm with Angela whether the feature is intended to support `client_audits` types before prompting Lovable. If yes, replace the local map with an import from `src/types/clientAudits.ts`.
- No CI check enforces the `AuditType` union ↔ DB constraint pairing. A TypeScript test that enumerates `AuditType` values and asserts they match the constraint list would prevent recurrence — worth raising if a test suite is ever added.
- `fetchPackages()`, `fetchCSCOptions()`, `checkConnectedTenant()`, `fetchCodeTables()` in `ManageTenants.tsx` remain as bare `useEffect` fetches — carried over from the 2026-04-28 audit as still-open.

---

## Tag

`audit-2026-04-29-client-audits-audit-type-constraint`
