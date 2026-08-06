# Audit: 2026-05-25 — L10 Meeting Fixes (Agenda Order, Conclude Rename, Todo Assignee, Meeting Close Bug)

**Trigger:** Lovable production DB change session — four L10 meeting issues identified and fixed.  
**Author:** Khian (Brian)  
**Scope:** `eos_agenda_templates` bulk update (389 rows); `generate_meeting_summary`, `close_meeting_with_validation` (both overloads) function rewrites; `AgendaTemplateEditor.tsx` and `LiveMeetingView.tsx` frontend updates. No other tables, hooks, or components touched.  
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### Fix 1 — L10 segment order wrong (Customer/Employee Headlines after IDS)

**Problem:** All L10 meeting templates had IDS (Identify, Discuss, Solve) in position 4 and Customer/Employee Headlines in position 5. The correct order is Headlines first, then IDS. Every meeting created from these templates ran in the wrong order.

**Database state at diagnosis:**

| Segment order variant | Template count |
|---|---|
| Rock Review → IDS → Customer/Employee Headlines → To-Do List → Conclude | 385 |
| Rock Review → Customer/Employee Headlines → IDS → To-Do List → Conclude | 3 |
| Rock Review → To-Do List → Headlines → IDS → Conclude (old naming) | 1 |
| **Total active L10 templates** | **389** |

**Blast radius:** `eos_agenda_templates` only. `eos_meeting_segments` (historical meeting records) not touched. No RLS policies, no FK dependencies affected.

**Fix — migration `20260525043239_be6e0aab-fbbe-4430-898b-4dd214d88e16.sql`:**

CTE-based UPDATE that expands each template's `segments` JSONB array, locates the ordinal positions of both target segment names, and swaps them — **only when IDS currently precedes Headlines** (directional guard). The 3 templates already in correct order were skipped. The 1 old-naming template was also skipped (exact name mismatch).

**Post-deploy verification:**
```sql
SELECT segment_order, COUNT(*) FROM (
  SELECT string_agg(s->>'name', ' → ' ORDER BY ordinality)
  FROM eos_agenda_templates, jsonb_array_elements(segments) WITH ORDINALITY AS t(s, ordinality)
  WHERE meeting_type = 'L10' AND is_archived = false
  GROUP BY id
) q(segment_order)
GROUP BY segment_order;
-- Result: 388 rows → correct order; 1 row → old naming (untouched) ✅
```

---

### Fix 2 — "Conclude" renamed to "Conclude / One Phrase Close"

**Problem:** The final L10 segment was labelled "Conclude" in all templates, the template editor defaults, and the live meeting screen heading. Renamed to "Conclude / One Phrase Close" throughout.

**Affected surface:**
- `eos_agenda_templates` — 389 active L10 templates (rename applied in the same CTE UPDATE as Fix 1)
- `src/components/eos/AgendaTemplateEditor.tsx` — `DEFAULT_SEGMENTS.L10` array
- `src/components/eos/LiveMeetingView.tsx` — hardcoded heading text at line 690
- `seed_system_agenda_templates()` — both overloads (no-arg and per-tenant) updated via same migration

**What was NOT changed:** `eos_meeting_segments` — 14 historical meeting rows named "Conclude" left as-is. The live meeting's `getSegmentType()` detection at line 355 uses `.includes('conclude')` and continues to match without change.

---

### Fix 3 — To-do assignee name not shown in meeting view

**Problem:** The `TodoInlineForm` lets you assign a to-do to a team member and saves `owner_id` (UUID) to `eos_todos`. The todo card in `LiveMeetingView.tsx` rendered only the title, due date, and status — the assigned person's name was never looked up or displayed.

**Root cause:** No name-lookup query existed for todos. The rocks section immediately above (lines 82–104) already had the correct pattern: collect owner UUIDs → `useQuery` against the `users` table → render names from a `Record<string, string>` map.

**Fix — `src/components/eos/LiveMeetingView.tsx` (no migration):**

Added `todoOwnerIds` useMemo and `todoOwners` useQuery mirroring the existing `rockOwners` pattern. Each todo card now renders:
```
Assigned to: [Name] (or "Unassigned" if owner_id is null or not found)
```

**Blast radius:** Display-only. No writes, no schema changes, no other components affected.

---

### Fix 4 — Meeting close fails for non-super-admin users after rating submission

**Problem:** After submitting a meeting rating and clicking "Close Meeting", non-super-admin users received an error and the meeting never closed. The meeting close transaction rolled back entirely.

**Root cause (two compounding issues):**

1. `generate_meeting_summary` contained a permission check:
   ```sql
   IF NOT (is_super_admin() OR has_meeting_role(auth.uid(), p_meeting_id, ARRAY['Leader']))
   THEN RAISE EXCEPTION 'Only facilitator can generate summary';
   ```
   `has_meeting_role` queries `eos_meeting_participants` — a deprecated table. Meeting roles are stored in `eos_meeting_attendees`. The check always returned false for real users, so the exception always fired.

2. `close_meeting_with_validation` called `PERFORM generate_meeting_summary(p_meeting_id)` with no exception handling. When the summary function raised, the entire transaction rolled back — including the `UPDATE eos_meetings SET status = 'closed'`. The meeting remained stuck in `in_progress`.

Meetings that did successfully close were closed by super-admin accounts, which bypass the check via `is_super_admin()`.

**Fix — migration `20260525041951_6dbb3fad-0a49-4a4c-a78d-9271e3ae133f.sql`:**

Three functions rewritten via `CREATE OR REPLACE`:

| Function | Change |
|---|---|
| `generate_meeting_summary(uuid)` | Removed the permission guard block entirely. Function is `SECURITY DEFINER` and only called from `close_meeting_with_validation`. All other logic preserved. |
| `close_meeting_with_validation(uuid)` | Wrapped `PERFORM generate_meeting_summary` in `BEGIN/EXCEPTION WHEN OTHERS THEN NULL; END` so summary failure cannot roll back the close. |
| `close_meeting_with_validation(uuid, boolean DEFAULT false)` | Same exception wrapper applied. `DEFAULT false` preserved. |

Summary generation is now best-effort: meeting closes first, summary is generated if possible, failure is silent.

**Blast radius:** Three DB functions only. No RLS, no frontend, no other tables. The two-arg overload's `p_force` logic and all audit event inserts preserved verbatim.

---

## KB changes shipped

- None this session.

## Codebase observations

- `unicorn @ 1b92aa18` — All four fixes shipped in one Lovable commit: "Fixed L10 templates and UI"
  - Migration `20260525041951`: `generate_meeting_summary` + both `close_meeting_with_validation` overloads
  - Migration `20260525043239`: `eos_agenda_templates` bulk update + both `seed_system_agenda_templates` overloads
  - `AgendaTemplateEditor.tsx`: `DEFAULT_SEGMENTS.L10` corrected
  - `LiveMeetingView.tsx`: todo assignee display + "Conclude / One Phrase Close" heading

## Decisions

- **Directional swap guard required** — a naive "swap when both names present" would have reversed the 3 templates already in correct order. The CTE was written to swap only when `ids_ord < hl_ord`.
- **Permission guard removed, not fixed** — `has_meeting_role` queries the wrong table (`eos_meeting_participants` instead of `eos_meeting_attendees`). Rather than fix the function (risk of unknown callers), the guard was removed from `generate_meeting_summary` since the function is `SECURITY DEFINER` and already guarded by its caller.
- **Exception wrapper added as defence-in-depth** — even with the permission guard removed, the wrapper ensures any future failure inside `generate_meeting_summary` can never block a meeting close.
- **Historical meeting segments not renamed** — 14 `eos_meeting_segments` rows named "Conclude" left as-is. These are closed meeting records; renaming them would alter history with no user-facing benefit.

## Open questions parked

- `has_meeting_role` still queries the deprecated `eos_meeting_participants` table. Other callers of this function have not been audited. If it is used elsewhere, those call sites may also be silently returning false. Flagged for future investigation but out of scope for this session.

## Tag

`audit-2026-05-25-l10-meeting-fixes`
