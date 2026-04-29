# Convert `audit_type` to `dd_audit_type` lookup

## 1. Migration (single file, single transaction)

New file: `supabase/migrations/<timestamp>_dd_audit_type_lookup.sql`

Header comment block contains the rollback SQL (drop FK → restore original CHECK → drop table).

Body, in order:

1. **Safety check** — `DO $$ ... $$` block raising an exception if any `client_audits.audit_type` row is outside the 7 known values. Aborts the transaction before any structural change.
2. **Create table** `public.dd_audit_type`:
   - `code serial PRIMARY KEY`
   - `value text NOT NULL UNIQUE`
   - `label text NOT NULL`
   - `sort_order integer NOT NULL DEFAULT 0`
   - `is_active boolean NOT NULL DEFAULT true`
3. **Seed 7 rows** with the exact value/label/sort_order list provided.
4. **RLS** — enable RLS, add a single SELECT-to-authenticated `USING (true)` policy named `"Authenticated users can read dd_audit_type"`. No write policy.
5. **Swap constraint** — `DROP CONSTRAINT client_audits_audit_type_check`, then `ADD CONSTRAINT client_audits_audit_type_fkey FOREIGN KEY (audit_type) REFERENCES public.dd_audit_type(value)`.

Postgres DDL is transactional; if any step fails the entire migration rolls back atomically. The sandbox migration runner wraps the file in a transaction by default.

## 2. New hook

New file: `src/hooks/useAuditTypeOptions.ts` — built to match `useActionStatusOptions.ts` line-for-line:

- `AuditTypeOption` interface: `{ value: string; label: string; sort_order: number }`
- Module-level `cachedTypes` and `fetchPromise`
- `loadTypes()` queries `dd_audit_type` selecting `code, value, label, sort_order`, filters `is_active = true`, orders by `sort_order` ascending, maps and caches the result. Reuses in-flight promise; clears `fetchPromise` and returns `[]` on error.
- `useAuditTypeOptions()` initialises state from `cachedTypes` if present, calls `loadTypes()` in `useEffect`, returns `{ auditTypes, loading }`.

## 3. Frontend wiring — `src/pages/AuditsAssessments.tsx`

Three localised edits:

1. Add import:
   ```ts
   import { useAuditTypeOptions } from '@/hooks/useAuditTypeOptions';
   ```
2. Inside the component (next to the existing filter useStates around line 42):
   ```ts
   const { auditTypes, loading: typesLoading } = useAuditTypeOptions();
   ```
   (`typesLoading` is intentionally unused for rendering — kept available, no spinner per spec.)
3. In the type-filter `<SelectContent>` (lines 115–122), keep the hardcoded `<SelectItem value="all">All Types</SelectItem>` and replace the 7 hardcoded items with:
   ```tsx
   {auditTypes.map(type => (
     <SelectItem key={type.value} value={type.value}>
       {type.label}
     </SelectItem>
   ))}
   ```

Nothing else in this file changes — `typeFilter` state, `filtered` useMemo, `hasFilters`, the four stat cards, and all other JSX remain identical.

## What will NOT change

- `src/types/clientAudits.ts` — `AuditType` union and `AUDIT_TYPE_LABELS` left intact.
- `AuditTypeBadge.tsx`, `NewAuditModal.tsx`, `useClientAudits.ts`, `AuditSchedulerSection`, `ReferenceLibrarySection`, `v_audit_schedule`.
- `research-audit-intelligence` edge function (its local `AUDIT_TYPE_LABELS` continues to work; values are identical).
- Any other `dd_*` table, RLS policy, trigger, or constraint.

## Risks / notes

- Verified pre-flight: 0 orphan rows in `client_audits.audit_type` today. The Step-1 guard re-checks at migration time so a race between now and apply is still caught.
- `dd_audit_type.value` is `UNIQUE NOT NULL` (FK target requirement).
- The hook's module-level cache is process-local; no invalidation API is needed because the lookup is effectively static for clients (SuperAdmin edits via Code Tables Management would require a hard refresh — same behaviour as `useActionStatusOptions`).
- Rollback is a 3-statement block in the header comment; safe to execute at any time because the original CHECK definition matches the seed values exactly.

## Recommendation

GO. Single migration file, single transaction, one new hook, three-line edit in one page. No other surfaces touched.
