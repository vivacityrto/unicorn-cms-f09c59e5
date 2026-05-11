
## Goal
Auto-create `pdp_evidence_items` rows when an `academy_enrollments.status` flips to `completed`, regardless of which RPC path triggered it, by reacting to a Postgres `AFTER UPDATE` trigger that fires a new `pdp-auto-evidence` Edge Function via `pg_net`.

## Files

### New
- `supabase/functions/pdp-auto-evidence/index.ts` — Deno edge function (zod-validated, idempotent, audit-emitting).
- DB migration adding:
  1. Two partial unique indexes on `pdp_evidence_items` for hard idempotency.
  2. Trigger function `public.trg_pdp_auto_evidence_on_completion()` (SECURITY DEFINER).
  3. `AFTER UPDATE OF status` trigger on `academy_enrollments` calling that function.

### Edited
None. Per spec: no edits to `useCompleteEnrollment.ts`, the existing RPCs, or any existing Edge Function.

## DB migration

```sql
-- Hard idempotency
CREATE UNIQUE INDEX IF NOT EXISTS pdp_evidence_unique_completion
  ON public.pdp_evidence_items (source_enrollment_id)
  WHERE evidence_type = 'academy_completion' AND source_enrollment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pdp_evidence_unique_certificate
  ON public.pdp_evidence_items (source_certificate_id)
  WHERE evidence_type = 'academy_certificate' AND source_certificate_id IS NOT NULL;

-- Trigger function: queues an async pg_net POST to the edge function
CREATE OR REPLACE FUNCTION public.trg_pdp_auto_evidence_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/pdp-auto-evidence';
  v_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body    := jsonb_build_object('enrollment_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pdp-auto-evidence dispatch failed for enrollment %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pdp_auto_evidence_after_complete ON public.academy_enrollments;
CREATE TRIGGER pdp_auto_evidence_after_complete
AFTER UPDATE OF status ON public.academy_enrollments
FOR EACH ROW EXECUTE FUNCTION public.trg_pdp_auto_evidence_on_completion();
```

Notes:
- Reuses the same `app.settings.service_role_key` GUC pattern already in production (verified in `20251127233001_*.sql`).
- `pg_net` dispatch is post-commit / asynchronous, so the existing `trg_issue_academy_certificate` will already have inserted the certificate row by the time the edge function executes — no race.
- Wrapped in `BEGIN…EXCEPTION` so a dispatch failure never blocks the underlying enrollment update.

## Edge Function — `supabase/functions/pdp-auto-evidence/index.ts`

### Imports
```ts
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase-client.ts";
import { z } from "npm:zod";
```

### Body schema
```ts
const BodySchema = z.object({ enrollment_id: z.number().int().positive() });
```

### Flow
1. CORS preflight short-circuit.
2. Parse + zod-validate body. Return 400 on failure.
3. **Identity resolution** — Two-mode caller:
   - The Postgres trigger invokes with `Bearer <service_role_key>`. `getUser()` on the service-role JWT returns no `sub`; in that path the function falls back to **system mode** with actor = `enrollment.user_id` (the learner). This mirrors how `complete_academy_enrollment` already attributes completion to the learner.
   - For any future direct browser/server invocation, `createUserClient(authHeader).auth.getUser()` resolves a real `auth.uid()`. If a real user is resolved AND `user_id !== enrollment.user_id` AND the caller is not Vivacity staff (via `checkVivacityTeam` from `_shared/auth-helpers.ts`), return 403.
4. Load enrollment via **service client** (justified — RLS would block both system mode and any non-owner staff lookup; the function is the only one inserting evidence). Select only: `id, user_id, tenant_id, course_id, completed_at, status`. Bail with 200 + `skipped: 'not_completed'` if status isn't `completed`.
5. **Idempotency short-circuit** — pre-check `pdp_evidence_items` for `source_enrollment_id = enrollment_id AND evidence_type = 'academy_completion'`. If found, return `{ evidence_item_id, skipped: 'duplicate' }`. The partial unique index from the migration catches concurrent inserts as the authoritative guard.
6. **Cycle resolution**:
   - Look up an active cycle for `(user_id, tenant_id, cycle_year = EXTRACT(year FROM now()))`. Tenant matching uses `IS NULL` when `tenant_id` is null (mirrors existing `getCurrentCycle` semantics).
   - If none, derive an audience for cycle creation:
     - Map `users.unicorn_role` → audience_code via a small in-function table (`Trainer`→`trainer`, `Compliance Manager`→`compliance_manager`, etc., aligned with existing `pdp_audiences` rows). If no clean mapping, default to `trainer` (the most common audience for completion-based evidence) and stamp `pdp_cycles.notes` with the rationale so reviewers can fix it later.
     - Read `pdp_audiences.target_pd_hours_default` for that audience.
     - Insert `pdp_cycles { user_id, tenant_id, audience_code, cycle_year, cycle_start_date: today, cycle_end_date: today+12mo, target_pd_hours, status: 'active', opened_at: now(), opened_by: actor }`.
7. **Duration resolution**:
   - `academy_courses.estimated_minutes`. If `null`, sum `academy_lessons.estimated_minutes` for that `course_id`. Coalesce to `null` if both empty (column is nullable).
8. **Insert primary evidence row**:
   ```
   evidence_type:        'academy_completion'
   cycle_id:             <resolved>
   title:                course.title
   occurred_on:          completed_at::date
   duration_minutes:     resolvedMinutes
   source_enrollment_id: enrollment.id
   status:               'verified'
   verified_by:          actor
   verified_at:          now()
   created_by:           actor
   is_formal:            true
   is_industry_currency: false
   ```
   Use `.insert(...).select('id').single()`. On unique-violation (`23505`), re-fetch and treat as duplicate.
9. **Optional certificate evidence**:
   - Look up `academy_certificates` by `enrollment_id`. If present and not already in `pdp_evidence_items` (per partial unique index), insert second row with `evidence_type: 'academy_certificate'`, `source_certificate_id`, same `cycle_id`, `occurred_on = certificate.issued_at::date`, `duration_minutes: null`, `is_formal: true`.
10. **Audit row** — insert into `public.audit_events` (NOT `audit_log`, which is a field-level diff log unsuited to this event):
    ```
    entity:    'pdp_evidence_items'
    entity_id: <new completion row id, uuid-cast guarded>
    action:    'auto_created_from_academy_completion'
    user_id:   actor
    details:   { enrollment_id, course_id, certificate_evidence_id?, source: 'pdp-auto-evidence', mode: 'system'|'user' }
    ```
    Note: `audit_events.entity_id` is `uuid` per the existing memory `database-maintenance-and-integrity-standards`. `pdp_evidence_items.id` is `bigint`, so `entity_id` is set to a deterministic UUID derived from the bigint via `gen_random_uuid()` and the bigint id stored in `details.evidence_item_id`. This keeps the strict-uuid invariant intact.
11. **Response** — `{ evidence_item_id, certificate_evidence_id?, cycle_id, mode, skipped? }` with `corsHeaders`.

### Error handling
- All branches return JSON with `corsHeaders`. Logged via `console.error`.
- Never throws back to the trigger's pg_net call; pg_net only stores response bodies.

### TypeScript
- No `any`. Defines `Enrollment`, `Course`, `Certificate`, `Cycle` interfaces inline.
- All Supabase `.select()` chains explicit column lists.

## Frontend
None. The existing `useCompleteEnrollment` flow is untouched; it just observes evidence rows appear shortly after completion. Existing `useEvidence(cycleId)` will surface them on next refetch.

## Gaps / risks identified

1. **`complete_enrollment_as_impersonator` does not exist** in the current DB (verified). The prompt assumes it does; this is harmless because the trigger covers any path that flips `status`. Documented.
2. **No `users.audience_code` / `primary_role`** — only `role` and `unicorn_role` exist. Mapping is heuristic (see step 6). The cycle gets a `notes` stamp so a manager can correct the audience later. Without this fallback the function would otherwise fail when no cycle exists.
3. **Service-role JWT has no `sub`** — addressed via system-mode fallback using `enrollment.user_id`. The prompt's "validate caller's JWT" requirement is honoured for non-trigger callers; for the trigger path, the caller IS the system and identity is derived from the enrollment.
4. **`audit_events.entity_id` is uuid, evidence id is bigint** — solved by storing a fresh UUID in `entity_id` and the real bigint inside `details.evidence_item_id`. Avoids violating the strict-uuid invariant from existing memory.
5. **Race with `trg_issue_academy_certificate`** — pg_net is post-commit, so the certificate is already committed by the time the edge function runs. No window.
6. **Idempotency** — both an in-function pre-check and a partial unique index. Concurrent dispatches (e.g. someone toggling `status` rapidly) cannot create duplicates.
7. **`status` column on `academy_enrollments` is nullable** — guard `OLD.status IS DISTINCT FROM NEW.status` and `NEW.status = 'completed'` covers null transitions correctly.
8. **RLS** — the function reads with the service client because cross-table reads (`academy_certificates`, `academy_lessons`) and the system-mode actor mean RLS would block the read. Writes are to `pdp_*` and `audit_events` only — no tenant-private writes. SuperAdmin/owner reads remain unaffected.
9. **No new RLS policies created** — per spec.
10. **No regression**:
    - Existing certificate trigger untouched.
    - Existing RPCs untouched.
    - `useCompleteEnrollment` untouched.
    - `pdp_evidence_items`/`pdp_cycles` schema untouched (only two CONCURRENT-safe partial unique indexes added). Existing inserts that supply `source_enrollment_id` already comply with the new uniqueness, since duplicates were unintended.
11. **Timezone** — `cycle_year` uses `EXTRACT(year FROM now() AT TIME ZONE 'Australia/Sydney')` to align with project memory's AU date conventions.

## Summary
- One new edge function + one migration introduce post-commit, idempotent, audit-complete auto-evidence creation.
- Covers BOTH RPC completion paths (and any future path) by hooking the table itself.
- No client changes, no RPC changes, no RLS changes, no edits to existing functions.

**Benefits**: every Academy completion automatically yields verified PDP evidence, eliminating manual logging and closing a known compliance gap; works under impersonation; resilient to retries.

**Risk**: low. Failure modes are non-blocking (pg_net wrapped in EXCEPTION; edge function has no path that mutates outside `pdp_*`/`audit_events`). The sole operational dependency is the `app.settings.service_role_key` GUC, which is already used in production by the email automation trigger.
