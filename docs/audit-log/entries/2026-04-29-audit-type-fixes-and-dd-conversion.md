# Audit: 2026-04-29 — audit_type full session: constraint fix, filter dropdown, edge function labels, dd_audit_type conversion

**Author:** Khian (Brian)  
**Trigger:** ad-hoc — `due_diligence_combined` audit creation silently blocked; investigation expanded to full audit_type surface audit and Dave-directed DB conversion  
**Scope:** `client_audits` CHECK constraint, `AuditsAssessments.tsx` filter dropdown, `research-audit-intelligence` edge function label map, new `dd_audit_type` lookup table + FK + `useAuditTypeOptions` hook  
**Codebase verified at:** `unicorn-cms-f09c59e5@732d788f` (session start)  
**Fix commits:** `20260428235523` (constraint), `a2464926` (filter dropdown), `2c18696d` + `732d788f` (edge function), `55df7177` (dd_audit_type + hook + AuditsAssessments wired up)

---

## Context

Session opened to investigate why creating a Combined RTO + CRICOS Due Diligence audit failed silently. Investigation found the `client_audits_audit_type_check` constraint was stale — it predated `due_diligence_combined` being added to the TypeScript `AuditType` union. A blast-radius check of all `audit_type` consumers then surfaced three additional gaps. Dave directed conversion of `audit_type` from a hardcoded enum to a `dd_audit_type` lookup table as a follow-on, aligned with the existing `dd_` pattern used for `dd_priority`, `dd_action_status`, and `dd_lifecycle_status`.

---

## Finding 1 — `client_audits_audit_type_check` stale: `due_diligence_combined` blocked

**Status:** Fixed

The live `client_audits_audit_type_check` constraint covered 6 values:

```sql
CHECK (audit_type = ANY (ARRAY[
  'compliance_health_check', 'cricos_chc', 'rto_cricos_chc',
  'mock_audit', 'cricos_mock_audit', 'due_diligence'
]))
```

`due_diligence_combined` was present in `src/types/clientAudits.ts` (`AuditType` union), all label maps, `NewAuditModal.tsx` card definitions, and `AUDIT_TYPE_TEMPLATE` — the DB gate was the only blocker. The error surfaced as a generic `Failed to create audit` toast with no indication of the cause.

**Note:** `client_audits` CREATE TABLE is not in any tracked migration — the table was created directly in the Supabase DB. This is Finding 5(a) below.

**Fix — migration `20260428235523` (29 Apr 2026):**

```sql
ALTER TABLE public.client_audits
  DROP CONSTRAINT client_audits_audit_type_check;

ALTER TABLE public.client_audits
  ADD CONSTRAINT client_audits_audit_type_check
  CHECK (audit_type = ANY (ARRAY[
    'compliance_health_check','cricos_chc','rto_cricos_chc',
    'mock_audit','cricos_mock_audit',
    'due_diligence','due_diligence_combined'
  ]));
```

Rollback script included in the migration file as a comment block.

**Post-fix state:** All 7 `AuditType` values insertable. Constraint widened additively; no existing rows affected.

---

## Finding 2 — `AuditsAssessments.tsx` filter dropdown missing 4 audit types

**Status:** Fixed

`src/pages/AuditsAssessments.tsx` filter `<SelectContent>` contained only 3 of 7 audit types:

```tsx
<SelectItem value="compliance_health_check">CHC</SelectItem>
<SelectItem value="mock_audit">Mock Audit</SelectItem>
<SelectItem value="due_diligence">Due Diligence</SelectItem>
```

Missing: `cricos_chc`, `rto_cricos_chc`, `cricos_mock_audit`, `due_diligence_combined`. Audits of those types appeared under "All Types" but could not be filtered specifically.

**Fix (`a2464926`, 29 Apr 2026):** Four `<SelectItem>` entries added. Scope: `AuditsAssessments.tsx` only, +4 lines, no state or data changes.

**Post-fix state:** All 7 `AuditType` values selectable in the filter dropdown. Subsequently superseded by Finding 4 (dropdown now DB-driven).

---

## Finding 3 — Edge function `AUDIT_TYPE_LABELS` incomplete + CHC label mismatch

**Status:** Fixed (two commits)

`supabase/functions/research-audit-intelligence/index.ts` `AUDIT_TYPE_LABELS` covered 5 legacy ASQA types only. Any call with a `client_audits` audit type fell back to the raw enum string in the AI prompt and report header.

Additionally, when Lovable extended the map to all 7 types, it chose `"CHC"` for `compliance_health_check`. The canonical label in `src/types/clientAudits.ts` (`AUDIT_TYPE_LABELS`) is `"CHC — RTO"`. A cross-map audit confirmed the mismatch spans:

| Location | `compliance_health_check` label |
|---|---|
| `src/types/clientAudits.ts` | `"CHC — RTO"` ← canonical |
| `src/hooks/useClientAudits.ts` (`AUDIT_TYPE_HUMAN`) | `"Compliance Health Check"` (title generation only) |
| `src/pages/AuditsAssessments.tsx` filter | `"CHC"` (short form, acceptable in context) |
| `supabase/functions/research-audit-intelligence/index.ts` | `"CHC"` ← wrong; corrected to `"CHC — RTO"` |

**Fix part 1 (`2c18696d`, 29 Apr 2026):** All 7 `AuditType` values added to edge function map.  
**Fix part 2 (`732d788f`, 29 Apr 2026):** `compliance_health_check` label corrected from `"CHC"` to `"CHC — RTO"`.

**Why this happened:** The edge function runs in Deno and cannot import from `src/`. Lovable had no reference to compare against. There is no mechanism today that would catch this divergence automatically.

**Prevention rule (do not reproduce):**
> The edge function `AUDIT_TYPE_LABELS` is a manually maintained copy of the canonical map in `src/types/clientAudits.ts`. Whenever `AuditType` gains a new value OR an existing label is renamed in `src/types/clientAudits.ts`, the edge function map must be updated in the same Lovable prompt. Before approving any Lovable fix that touches either map, cross-check every key against the other.

---

## Finding 4 — `dd_audit_type` table + FK + `useAuditTypeOptions` hook (Dave direction)

**Status:** Shipped

Dave directed conversion of `audit_type` from a hardcoded TypeScript enum to a DB-backed lookup table, aligned with the existing `dd_` pattern used across the platform (`dd_priority`, `dd_action_status`, `dd_lifecycle_status`, etc.).

**Migration `20260429060828` (`55df7177`, 29 Apr 2026):**

Step 1 — Safety check (fail fast if orphan rows exist):
```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.client_audits
    WHERE audit_type NOT IN (
      'compliance_health_check','cricos_chc','rto_cricos_chc',
      'mock_audit','cricos_mock_audit',
      'due_diligence','due_diligence_combined'
    )
  ) THEN
    RAISE EXCEPTION 'Orphan audit_type rows found — migration aborted';
  END IF;
END $$;
```

Step 2 — Create table:
```sql
CREATE TABLE public.dd_audit_type (
  code        serial PRIMARY KEY,
  value       text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);
```

Step 3 — Seed 7 rows (labels match canonical `AUDIT_TYPE_LABELS` in `src/types/clientAudits.ts`):

| value | label | sort_order |
|---|---|---|
| `compliance_health_check` | `CHC — RTO` | 1 |
| `cricos_chc` | `CHC — CRICOS` | 2 |
| `rto_cricos_chc` | `CHC — RTO + CRICOS` | 3 |
| `mock_audit` | `Mock Audit` | 4 |
| `cricos_mock_audit` | `Mock Audit — CRICOS` | 5 |
| `due_diligence` | `Due Diligence` | 6 |
| `due_diligence_combined` | `Combined RTO + CRICOS Due Diligence` | 7 |

Step 4 — RLS (matching `dd_priority` exactly):
```sql
ALTER TABLE public.dd_audit_type ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read dd_audit_type"
  ON public.dd_audit_type FOR SELECT TO authenticated USING (true);
```

Step 5 — Drop CHECK, replace with FK:
```sql
ALTER TABLE public.client_audits
  DROP CONSTRAINT client_audits_audit_type_check;

ALTER TABLE public.client_audits
  ADD CONSTRAINT client_audits_audit_type_fkey
  FOREIGN KEY (audit_type) REFERENCES public.dd_audit_type(value);
```

Rollback script included as a comment block at the top of the migration file.

**New hook — `src/hooks/useAuditTypeOptions.ts`:**

Module-level cache + promise deduplication pattern (identical to `useActionStatusOptions`). Queries `dd_audit_type` filtering `is_active = true`, ordered by `sort_order`. Returns `{ auditTypes, loading }` where each item is `{ value, label, sort_order }`.

**`AuditsAssessments.tsx` wired up (same commit):**

The 7 hardcoded `<SelectItem>` elements replaced with:
```tsx
<SelectItem value="all">All Types</SelectItem>
{auditTypes.map(type => (
  <SelectItem key={type.value} value={type.value}>
    {type.label}
  </SelectItem>
))}
```

**Blast-radius check was completed before approval.** Full consumer inventory confirmed:

- **Not touched in this change (intentional):** `AuditType` union in `src/types/clientAudits.ts`, `AUDIT_TYPE_LABELS`, `AuditTypeBadge.tsx`, `NewAuditModal.tsx`, `useClientAudits.ts`, `research-audit-intelligence` edge function, `v_audit_schedule` view, `STAGE_AUDIT_TYPE_MAP`, `useAuditScheduler.ts`
- **Scope of change:** DB table + RLS + FK + new hook + filter dropdown only

**Known technical debt introduced (intentional, documented):**

1. **Two label sources of truth** — `dd_audit_type.label` (DB, used by filter dropdown) and `AUDIT_TYPE_LABELS` in `src/types/clientAudits.ts` (TypeScript, used by `AuditTypeBadge`, `buildPreliminaryAuditSummary`, `ClientAuditReportsSection`). Seeds match today; can drift if one is updated without the other.

2. **Hook cache won't auto-refresh** — module-level cache is session-scoped. A new type added to `dd_audit_type` won't appear in the filter dropdown until page reload. Same limitation exists across all `dd_` hooks; acceptable for reference data.

3. **`AuditTypeBadge.tsx` `BADGE_STYLES` still hardcoded** — a new type added to `dd_audit_type` will have no badge colour until the TS `Record<AuditType, string>` is manually extended. Requires a Lovable prompt.

4. **`NewAuditModal.tsx` card arrays still hardcoded** — a new type in `dd_audit_type` won't appear in the create wizard without a separate Lovable prompt.

---

## Finding 5 — Structural issues flagged for Carl

Three issues identified during the session, not blocking, no fix attempted.

### 5a — `client_audits` CREATE TABLE not in any tracked migration

The table was created directly in Supabase — not via any migration file. All 897+ migrations were searched; none creates `client_audits`. The first tracked migration touching the table's schema is `20260428235523` (Finding 1 above). Any future structural change (column addition, index, constraint) must be delivered as a tracked migration — there is no SQL source of truth in the repo.

### 5b — `AuditIntelligencePackPanel.tsx` local label map covers legacy ASQA types only

`src/components/tenant/AuditIntelligencePackPanel.tsx` (lines 32–38) has a third local copy of `AUDIT_TYPE_LABELS` covering only 5 legacy ASQA types (`initial_registration`, `re_registration`, `extension_to_scope`, `strategic_review`, `post_audit_response`). The "Generate Intelligence Pack" dropdown therefore does not show any current `client_audits` audit types. Whether this is intentional or a gap requires Angela/Carl confirmation before a Lovable fix is raised.

### 5c — No CI enforcement of `AuditType` union ↔ DB constraint pairing

There is no TypeScript test or CI check that enumerates `AuditType` values and asserts they match the DB constraint (previously CHECK, now FK via `dd_audit_type`). The gap that caused Finding 1 can recur silently whenever the union is extended. Worth raising if a test suite is ever added.

---

## Process — `unicorn-dev-flow` skill updated with blast-radius rules

The blast-radius check procedure for `dd_` table conversions was formalised and added to the `unicorn-dev-flow` skill during this session. Key additions:

- Pre-prompt check: identify all TypeScript consumers of the enum/union before drafting any Lovable prompt
- Explicit "do not touch" list required in any prompt touching a shared type
- Two-label-source drift documented as a known pattern requiring manual sync

---

## Root cause summary

`AuditType` values were added to the TypeScript union over time without corresponding DB constraint updates. Because `client_audits` was not created via a tracked migration, the constraint was invisible in code review. The broader pattern of hardcoded label maps duplicated across frontend and edge function layers creates ongoing drift risk. The `dd_audit_type` conversion closes the DB enforcement gap and begins migrating the filter UI to DB-driven data; full migration of all consumers is out of scope for this session.

---

## KB changes shipped

None this session — dev-guardrails traps were updated in the prior session (`unicorn-kb@55f5d30`, PR #22). The process update to `unicorn-dev-flow` is a skill-level change, not a KB doc change.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5@732d788f` — session start; `compliance_health_check` edge function label corrected to `"CHC — RTO"`.
- `unicorn-cms-f09c59e5@20260428235523` (migration, commit `798ffb80`) — `client_audits_audit_type_check` widened to include `due_diligence_combined`.
- `unicorn-cms-f09c59e5@a2464926` — `AuditsAssessments.tsx` filter dropdown extended to all 7 `AuditType` values (Finding 2 closed).
- `unicorn-cms-f09c59e5@2c18696d` — edge function `AUDIT_TYPE_LABELS` extended with all 7 values.
- `unicorn-cms-f09c59e5@732d788f` — edge function `compliance_health_check` label corrected from `"CHC"` to `"CHC — RTO"` (Finding 3 closed).
- `unicorn-cms-f09c59e5@55df7177` — `dd_audit_type` table created, seeded, RLS applied, FK replaces CHECK; `useAuditTypeOptions` hook created; `AuditsAssessments.tsx` filter dropdown wired to DB (Finding 4 shipped).

---

## Decisions

None drafted or resolved this session.

---

## Open questions parked

- `AuditIntelligencePackPanel.tsx` local label map covers legacy ASQA types only — confirm with Angela whether the Generate Intelligence Pack feature is intended to support current `client_audits` audit types before raising a Lovable fix (Finding 5b).
- No CI check enforces `AuditType` union ↔ `dd_audit_type` row parity. Worth raising if a test suite is added (Finding 5c).
- Full consumer migration (`AuditTypeBadge.tsx`, `NewAuditModal.tsx`, `useClientAudits.ts`, edge function) not in scope for this session — separate Lovable prompts required per consumer.

---

## Tag

`audit-2026-04-29-audit-type-fixes-and-dd-conversion`
