# Audit: 2026-05-18 — Phase 4C (`tenant_user_role`), Bug A (L10 segment reorder), Bug B (help centre chatbot)

**Trigger:** Lovable production DB change session — Phase 4C of the identity/role enum family, plus two product bugs surfaced during the same session.
**Author:** Khian (Brian)
**Scope:** Phase 4C (`tenant_user_role` → `dd_relationship_role`); Bug A (L10 meeting segment order — To-Do List before IDS); Bug B (help centre chatbot reply not rendering + raw markdown). Out of scope: Phase 4D (`unicorn_role`), Phase 4 cleanup migration (blocked by `archive.backup_users` — deferred to Carl).
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### Phase 4C — `tenant_user_role` → `dd_relationship_role` (complete)

Full `enumtodd` skill run completed. Carl + Dave sign-off confirmed before implementation.

**Coupling (live DB scan):** 2 SQL functions + 2 RLS policies referencing the enum. Two columns in scope: `tenant_users.relationship_role` (457 rows, all 4 values in use) and `user_invitations.relationship_role` (31 rows, 3 values in use — `academy_user` unused).

**DB changes delivered:**

Migration `20260518023538_af3ec70f-2687-4995-9adb-2f1f8283b636.sql` (main):

- `public.dd_relationship_role` created using the strict `dd_accounting_system` standard shape.
- Seeded with 4 values byte-identical to enum labels: `primary_contact`/Primary Contact/10, `secondary_contact`/Secondary Contact/20, `user`/User/30, `academy_user`/Academy User/40. All `is_active = true`.
- RLS enabled with `TO public USING (true)` SELECT policy; no write policy (service role only).
- `tenant_users.relationship_role` changed from `public.tenant_user_role` to `text NULL` (nullability preserved). FK `tenant_users_relationship_role_fkey` added referencing `dd_relationship_role(value)` ON UPDATE CASCADE ON DELETE RESTRICT.
- `user_invitations.relationship_role` changed from `public.tenant_user_role` to `text NULL`. FK added referencing `dd_relationship_role(value)` ON UPDATE CASCADE ON DELETE RESTRICT.
- `uniq_tenant_one_primary_contact` and `uniq_tenant_one_secondary_contact` unique constraints dropped and recreated without `::tenant_user_role` cast.
- `set_relationship_role` function recreated with `text` parameter; old enum-typed overload dropped.
- `accept_invitation_v2` internal variable type updated from enum to `text`.
- 2 RLS policies rewritten (cast removal only, logic byte-identical): `audit_user_events_select_tenant_admin`, `pdp_cycles: tenant admins view their tenant`.
- `v_client_tenant_users` view dropped and recreated (definition unchanged — required to clear enum dependency).
- Legacy enum `public.tenant_user_role` retained with `COMMENT ON TYPE` retention notice.

Migration `20260518025545_7f3fd367-bab5-4b1f-b7b9-fed4f6ac0658.sql` (overload drop):

- Dead enum-typed overload of `set_relationship_role` dropped in a second migration after the main migration confirmed successful. Required a second pass because the overload could not be dropped in the same transaction as the column type change.

TypeScript regenerated after Phase 4C. All 10 post-deploy checks passed.

---

### Bug A — L10 meeting segment order: To-Do List appearing before IDS (resolved)

**Root cause:** The `eos_agenda_templates` table stores segment order as a JSONB array in the `segments` column. The "Standard Level 10" template had "To-Do List" at position 5 and "IDS (Identify, Discuss, Solve)" at position 6. This order flowed into `eos_meeting_segments.sequence_order` when meetings were created from the template. The correct EOS L10 order for this implementation has IDS before To-Do List.

**Scope at time of fix:** 13 meetings total in `eos_meeting_segments`; only 1 had both segments present; 12 had "To-Do List" only. All L10 templates affected.

**DB changes delivered (migration `20260518040649_937c449f-fbe9-464e-aa45-36483d9a9169.sql`, data-only):**

- `eos_agenda_templates` (L10 rows): JSONB array rebuilt with IDS and To-Do List positions swapped. All other segment elements and their `duration`/`duration_minutes` keys preserved. Idempotent — WHERE clause skips already-correct rows.
- `eos_agenda_template_versions` (L10 template versions): same swap applied to `segments_snapshot`.
- `eos_meeting_segments`: per-meeting three-phase sequence_order swap (park To-Do at -1, move IDS to old To-Do position, restore To-Do to old IDS position) to protect any `UNIQUE (meeting_id, sequence_order)` constraint. Applied only to meetings where both segments existed and To-Do preceded IDS.
- Audit trail row inserted into `public.audit_events` (`eos.segment_order.fix_tod_after_ids`).

Two audit triggers on `eos_meeting_segments` (`audit_eos_meeting_segments`, `audit_segments_changes`) fired correctly — change is captured in the EOS audit log.

**Post-deploy verification (both returned 0):**
- L10 templates still showing To-Do before IDS: **0**
- Meetings still showing To-Do before IDS: **0**

No frontend changes required. `LiveMeetingView` renders segments by `sequence_order` ascending — the data fix was sufficient.

---

### Bug B — Help centre chatbot: reply not rendering + raw markdown (resolved)

**Root cause (two issues in `ChatTab.tsx`):**

1. **Reply not rendering:** `sendMessage` relied on `data?.assistant_message` from the edge function response to append the reply to React state. The `help-center-chat` edge function was saving the reply to `help_messages` correctly (confirmed: switching panels remounted the component, reloaded from DB, and the message appeared), but was not returning `assistant_message` in the response format the component expected. The silent check failed and the reply was never appended — loading spinner cleared with no message shown.

2. **Raw markdown:** `{msg.content}` was rendered as plain text. Responses from the AI contain markdown syntax (`**bold**`, `* bullets`, `##` headings) which displayed as raw characters.

**Fix (frontend-only, `ChatTab.tsx`, codebase commit `0b7e3fd9`):**

- `react-markdown` imported (already a declared project dependency — used in `ClientAskVivPanel`).
- `data?.assistant_message` block replaced with a direct DB fetch of the latest assistant message for the thread after the edge function returns. Resilient to any edge function response format changes.
- Assistant messages now rendered through `ReactMarkdown` with the same custom component overrides as `ClientAskVivPanel` (`h2`, `ul`, `ol`, `li`, `p`). User messages remain plain text.

No DB changes, no RLS changes, no edge function changes.

---

## KB changes shipped

- no changes — EnumToDdInventory.md Phase 4C row was already populated at session start (18 May 2026 entry). No KB edits needed.

## Codebase observations

- unicorn @ `8fb7fb21` — Bug A data migration shipped (L10 segment reorder)
- unicorn @ `0b7e3fd9` — Bug B frontend fix shipped (`ChatTab.tsx`)
- Phase 4C migrations at `20260518023538` + `20260518025545` — applied and verified

## Decisions

- Phase 4C (`tenant_user_role` → `dd_relationship_role`) confirmed complete. Phase 4D (`unicorn_role`) remains not started — heaviest coupling in the entire enum migration project (56 SQL functions + 87 RLS policies); will require a multi-stage rollout plan before a single-migration approach is attempted.

## Open questions parked

- Phase 4 cleanup migration (retiring legacy `staff_team_type` and `user_type_enum` enum types) remains blocked by `archive.backup_users` — decision deferred to Carl (documented in EnumToDdInventory.md Open Decisions).
- Phase 4D (`unicorn_role`) plan not yet drafted — Carl/Dave sign-off required before any implementation begins.

## Tag

audit-2026-05-18-phase-4c-bugs-todo-reorder
