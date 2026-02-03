
Context recap (what’s happening)
- In /eos/accountability, clicking “Assign Owner” triggers a write to public.accountability_seat_assignments (via useAccountabilityChart.addAssignment()).
- That INSERT fires two DB-side triggers:
  1) audit_accountability_chart_change() → writes to public.audit_eos_events
  2) tr_cascade_seat_owner_to_rocks → calls public.cascade_seat_owner_to_rocks() → writes to public.eos_rocks (and also writes an audit row)

What the current error actually is (root cause)
- The toast in your screenshot now shows:
  “column ‘entity_id’ is of type uuid but expression is of type text”
- That error is coming from the DB audit trigger function audit_accountability_chart_change() defined in:
  supabase/migrations/20260203075508_6e3899c3-ebac-4c14-b0c8-2f8e4c7fc579.sql
- In that function, entity_id is being inserted as COALESCE(NEW.id::text, OLD.id::text).
- But public.audit_eos_events.entity_id is UUID (confirmed via schema query), so inserting text fails.

Why the previous “enum eos_rock_status: complete” fix didn’t fully resolve it
- We patched cascade_seat_owner_to_rocks() to avoid invalid enum comparisons.
- However, the owner assignment flow still triggers audit_accountability_chart_change(), which still casts id::text and fails before you ever see a successful owner assignment.

Required outcomes (per your prompt)
1) Assign Owner succeeds and persists.
2) Assign Owner from Accountability Chart must not write to Rocks (no eos_rocks updates).
3) Eliminate uuid/text mismatches (no casts from uuid to text where the DB expects uuid).
4) Improve error visibility (no silent failures; console logging in dev).

Implementation plan

Phase 1 — Fix the blocking UUID audit error (DB)
A. Patch audit_accountability_chart_change() to insert UUID into audit_eos_events.entity_id
- Create a new Supabase migration that:
  - CREATE OR REPLACE FUNCTION public.audit_accountability_chart_change()
  - Change:
    entity_id = COALESCE(NEW.id::text, OLD.id::text)
    to:
    entity_id = COALESCE(NEW.id, OLD.id)
  - Keep the rest of the JSON details as-is.
- This immediately unblocks writes to accountability_* tables that currently fail due to the audit trigger.

B. Sanity check (DB read-only verification steps)
- After migration, verify:
  - INSERT into accountability_seat_assignments succeeds (no uuid/text error)
  - An audit row is created in audit_eos_events with entity_id as a UUID.

Phase 2 — Enforce “no Rocks writes” during Accountability owner assignment (DB)
C. Disable seat-assignment → rock cascade from this flow
- Today, inserting a “Primary” assignment triggers tr_cascade_seat_owner_to_rocks on public.accountability_seat_assignments.
- To satisfy “Assigning an owner must only update accountability ownership and must not touch Rocks”, we will:
  - DROP TRIGGER IF EXISTS tr_cascade_seat_owner_to_rocks ON public.accountability_seat_assignments;
  - (Optional, but recommended) Leave the function public.cascade_seat_owner_to_rocks() in place with an updated COMMENT explaining it is currently detached/disabled to prevent cross-module side effects from Accountability UI.
- Result: accountability owner assignment won’t modify eos_rocks at all.

D. (Optional follow-up, not required for this patch) Re-introduce rock-owner sync safely elsewhere
- If you still want the “Rocks follow seat owner” behaviour, we can implement it later in a controlled way:
  - On explicit “Sync rock owners” action from Rocks module, or
  - On a dedicated, well-scoped RPC invoked only where intended
- This avoids accidental coupling and exactly matches your “no side effects” requirement.

Phase 3 — Make the UI error handling explicit and add dev logging (Frontend)
E. Add console logging for the Assign Owner mutation
- In src/hooks/useAccountabilityChart.tsx, inside addAssignment mutation:
  - Wrap the “end-date previous primary” update call with error handling and logging.
  - If either the “close old primary” update or the insert fails:
    - console.error() with:
      - the payload being inserted (seat_id, user_id, assignment_type, tenant_id, start_date)
      - Supabase error object
    - show the existing destructive toast with the error message (already present).
- This ensures there is never a “no-op” silent failure during development.

F. Make the toast text specific to “Owner assignment”
- The mutation currently toasts “Assignment added”.
- Update copy (only) so the user sees:
  - Success: “Owner assigned”
  - Error title: “Owner assignment failed”
  - Error description: include error.message
- This reduces confusion for non-technical users.

Phase 4 — Verify the flow end-to-end (QA checklist)
G. Manual acceptance checks (must pass)
1) Go to /eos/accountability
2) Click Assign Owner on Visionary
3) Pick a Vivacity Team user
Expected:
- No toast error
- Owner appears on the card immediately
- Refresh page → owner persists

4) Confirm no Rocks writes occurred
- In Supabase SQL editor (read-only check), compare eos_rocks updated_at before/after, or filter recent updates by current user/time window:
Expected:
- No eos_rocks rows updated as a result of owner assignment.

5) Confirm audit row created correctly
Expected:
- audit_eos_events contains a record for accountability_seat_assignments (or whichever table changed)
- entity_id is a UUID, not text.

Files / resources we will touch (next step when approved)
- Database migration (new): fix audit_accountability_chart_change() + drop tr_cascade_seat_owner_to_rocks trigger
- Frontend:
  - src/hooks/useAccountabilityChart.tsx (add logs + adjust toasts for the “Assign Owner” path)

Notes on scope and safety
- This plan intentionally does not refactor your overall EOS model (functions vs seats vs roles) further; it is a surgical fix to:
  - remove the blocking uuid/text error
  - ensure Assign Owner has no Rocks side effects
  - improve observability for future debugging
- It preserves audit logging (required by your guardrails) and fixes it to be type-correct.

Open question (non-blocking, but helps finalize the “no Rocks writes” guarantee)
- Do you want to permanently disable automatic “seat owner → rock owner” cascading, or do you want it moved behind an explicit action/RPC used only from the Rocks area?
  - This plan disables it now to meet your acceptance criteria, and we can reintroduce it safely later if needed.