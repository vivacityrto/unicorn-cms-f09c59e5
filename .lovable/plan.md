
Context observed (from your screenshots + current DB code)
- The UI shows “Ready to Close Meeting” and even shows “Your rating: 10/10”, so rating is being recorded at least at the UI/data level.
- The toast error in the screenshot says: “Failed to close meeting: column ‘entity_id’ is of type uuid but expression is of type text”.
- In the database schema, `audit_eos_events.entity_id` is `uuid` (confirmed from schema inspection).
- In the `public.close_meeting_with_validation(p_meeting_id uuid)` function (defined in `supabase/migrations/20260120073453_9c9871bb-10bc-4bde-b53d-1696cf1b50ae.sql`), both audit inserts cast the meeting id to TEXT:
  - `p_meeting_id::TEXT` is inserted into `audit_eos_events.entity_id`
  - That cast will now hard-fail because `audit_eos_events.entity_id` is uuid.

Root cause
- A mismatch between:
  1) The later migration that made `audit_eos_events.entity_id` a UUID (and related audit helper function updates), and
  2) The meeting close function still writing `entity_id` as TEXT.
- This breaks meeting closure even when validation passes and rating exists.

What we will change (minimal, isolated, compliance-safe)
1) Create a new Supabase migration that patches ONLY the `close_meeting_with_validation` RPC to insert UUIDs correctly.
   - Replace both occurrences of `p_meeting_id::TEXT` with `p_meeting_id`.
   - Keep all other behavior unchanged (validation logic, meeting status update, summary generation, etc.).
   - This is a surgical fix: no table changes, no policy changes, no unrelated refactors.

2) Optional hardening inside the same migration (recommended)
   - Add explicit column lists (already present) and ensure `entity_id` is always a UUID.
   - If the audit event sometimes shouldn’t have an `entity_id`, we’ll use NULL (uuid) rather than text. In this specific case it should be the meeting UUID, so we’ll keep it set.

3) Verify no other meeting-close path still writes TEXT into `audit_eos_events.entity_id`
   - Search for `meeting_closed` / `meeting_validation_failed` usage (already isolated to this function).
   - If there are other inserts into `audit_eos_events` elsewhere using `::text` for `entity_id`, we will not change them unless they cause errors, per the “minimal and isolated” rule.

Implementation steps (what will happen in code/db)
A) Database migration
- Add a new migration file that runs:
  - `CREATE OR REPLACE FUNCTION public.close_meeting_with_validation(p_meeting_id UUID) ...`
  - Change the two inserts:

  Before:
  - `... entity_id, ... SELECT ..., p_meeting_id::TEXT, ...`
  - `... VALUES (..., p_meeting_id::TEXT, ...)`

  After:
  - `... entity_id, ... SELECT ..., p_meeting_id, ...`
  - `... VALUES (..., p_meeting_id, ...)`

B) No frontend changes required
- The frontend already calls `supabase.rpc('close_meeting_with_validation', { p_meeting_id })` via `useMeetingOutcomes`.
- Once the RPC stops erroring, “Close Meeting” should succeed and navigate to the summary page.

Testing checklist (end-to-end)
1) Start/continue an L10 meeting.
2) Open “End Meeting” / Meeting Close Checklist.
3) Click a rating (e.g., 10).
   - Confirm it shows “Your rating: 10/10”.
4) Click “Close Meeting”.
   - Expected: no error toast; meeting transitions to closed; user is redirected to `/eos/meetings/:id/summary`.
5) Re-open the meeting summary and confirm:
   - Status shows closed / completed timestamp set.
   - Ratings count is present.
6) (Optional) Confirm an audit event exists in `audit_eos_events` for `meeting_closed` with `entity_id = meeting_id` as UUID.

Risks / edge cases
- If the caller is not allowed to generate the meeting summary (the RPC calls `generate_meeting_summary`), closure could still fail with a different error (“Only facilitator can generate summary”). Your current toast error is not that; it is the UUID/TEXT mismatch. After this fix, if that next error appears, we will address it separately with another minimal change (likely allowing summary generation from the close function context or relaxing that permission check in a controlled way).
- No tenant isolation changes are introduced here; we are only fixing audit data typing, preserving existing security posture.

Files/areas that will be changed
- New SQL migration: patch `public.close_meeting_with_validation` audit inserts to use UUID `entity_id`.
- No UI/React changes in this step (keeps scope minimal and isolated).
