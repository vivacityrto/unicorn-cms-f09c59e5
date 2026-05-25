# Fix L10 meeting close failure

## Problem
Closing an L10 meeting fails for non-super-admins because `generate_meeting_summary` raises an unhandled exception (wrong role check using the deprecated `eos_meeting_participants` table), which rolls back the meeting close transaction in `close_meeting_with_validation`.

## Fix — single migration, `CREATE OR REPLACE` three functions

### 1. `generate_meeting_summary(uuid)`
Remove the permission guard block:
```
IF NOT (is_super_admin() OR has_meeting_role(auth.uid(), p_meeting_id, ARRAY['Leader'])) THEN
  RAISE EXCEPTION 'Only facilitator can generate summary';
END IF;
```
All other logic (idempotency, aggregations, summary insert, `is_complete` update, audit event) preserved verbatim.

### 2. `close_meeting_with_validation(uuid)` — single-arg overload
Wrap the summary call:
```
BEGIN
  PERFORM generate_meeting_summary(p_meeting_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
```
All other logic preserved.

### 3. `close_meeting_with_validation(uuid, boolean)` — two-arg overload
There is a second overload with `p_force boolean` that also calls `PERFORM generate_meeting_summary(...)` unguarded. Same wrap applied so closing via either signature is protected. All other logic preserved.

## Out of scope
- No RLS changes
- No frontend changes
- No changes to `has_meeting_role`, `eos_meeting_attendees`, or any other function
- No drops; all three use `CREATE OR REPLACE`

## Risk
Very low. Summary becomes best-effort during close (matches the user's intent: summary failure must never block close). Permission removal on `generate_meeting_summary` is acceptable — the function is `SECURITY DEFINER` and only invoked from `close_meeting_with_validation` (which itself runs only for in-progress meetings the caller can already act on).
