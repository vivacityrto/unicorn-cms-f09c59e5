# Audit: 2026-05-14 — enum-to-dd Phase 3A: notification_event_type → dd_notification_event

**Trigger:** Lovable production DB change session — Phase 3A of the enum-to-`dd_` rollout.
**Author:** Khian (Brian)
**Scope:** Phase 3A only — `notification_event_type` enum migration to `dd_notification_event` lookup table, plus follow-up drift signal fix for three under-wired notification event types. Out of scope: Phase 3B–3D (not started), Phase 4–5 (blocked pending Carl + Dave sign-off).
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### Phase 3A — `notification_event_type` (complete)

Full enumtodd skill run completed across all 8 phases (Orientation → Migration-Ready Handoff). Carl + Dave sign-off confirmed before Phase 7.

**DB changes delivered (two migration files):**

Migration 1 — `dd_notification_event` table:
- `dd_notification_event` created using the `dd_accounting_system` standard shape (`serial` id, `value text NOT NULL UNIQUE`, `label text NOT NULL`, `sort_order integer NOT NULL DEFAULT 0`, `is_active boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`).
- Seeded with all 10 values byte-identical to enum labels: `task_assigned`, `task_overdue`, `risk_flagged`, `package_threshold_80`, `package_threshold_95`, `package_threshold_100`, `meeting_action_created`, `document_request_created`, `note_shared`, `note_added`.
- RLS enabled: read policy scoped to `authenticated`, write policy scoped to Super Admin (`unicorn_role = 'Super Admin'`).

Migration 2 — column migration + RPC update:
- `notification_rules.event_type`, `notification_outbox.event_type`, `notification_audit_log.event_type` changed from `public.notification_event_type` enum to `text NOT NULL` via `USING event_type::text`.
- FK constraints added on all three columns referencing `dd_notification_event(value)` with `ON UPDATE CASCADE ON DELETE RESTRICT`.
- `emit_notification` RPC recreated with `p_event_type text` (was `public.notification_event_type`). Added defensive lookup: raises `'Unknown or inactive notification event_type: %'` if value not found or `is_active = false` in `dd_notification_event`.
- EXECUTE grant restored to `PUBLIC`.

Migration 3 — retention notice:
- `COMMENT ON TYPE public.notification_event_type` added with retention notice: do not drop until Phase 3B–3D complete. Legacy enum retained for rollback safety.

**Codebase changes:**
- TypeScript types regenerated post-migration. `event_type` columns now typed as `string` in generated types; `emit_notification` `p_event_type` parameter now `string`.
- `as any` casts removed from `src/lib/noteNotifications.ts` (lines 133, 181) and `src/hooks/useDocumentRequests.tsx` (line 114) — these were workarounds for the enum type and are now redundant.

**Post-deploy verification:** All 7 checks passed:
- `dd_notification_event` has 10 rows.
- All 3 columns report `data_type = text`.
- 3 FK constraints confirmed present.
- No nulls in any column.
- All 237 outbox rows FK-valid (no orphans).
- Legacy enum `public.notification_event_type` still present in `pg_type`.
- `emit_notification` accepts `p_event_type text`.

**Behavior change logged:** `emit_notification` now raises on unknown or inactive event types rather than silently skipping. Documented in `unicorn-kb/reference/notification-system-behavior.md`.

---

### Drift signal fix — incomplete wiring for 3 event types (complete)

**Finding:** During Phase 3A blast-radius audit, three notification event types (`document_request_created`, `note_shared`, `note_added`) were found to be emitted correctly but missing from three app-layer locations. These were added to the enum after the original 7 were built and the app code was never updated.

**Gaps identified:**
- `supabase/functions/process-notification-outbox/index.ts` — `eventTitles` map had only 7 entries; these 3 types fell back to `'Unicorn Notification'` as the Teams message title.
- `src/hooks/useTeamsNotifications.tsx` — `NotificationEventType` union and `EVENT_TYPE_LABELS` map had only 7 entries.
- `src/components/notifications/NotificationRulesCard.tsx` — `ALL_EVENT_TYPES` array had only 7 entries; users could not toggle these types in the Rules UI.

**Live data at time of fix:** 215 `note_shared` + 23 `note_added` rows queued in `notification_outbox` (all status `queued`, `attempt_count: 0`). These will now deliver with correct Teams titles on next processor run.

**Fix delivered (codebase only, no DB changes):**
- Added `document_request_created`, `note_shared`, `note_added` to `eventTitles` map in edge function.
- Extended `NotificationEventType` union and `EVENT_TYPE_LABELS` in `useTeamsNotifications.tsx`.
- Extended `ALL_EVENT_TYPES` in `NotificationRulesCard.tsx`.

**Blast radius:** Contained to 3 files. `NotificationSettings.tsx` and `RecentNotificationsCard.tsx` automatically improved (correct labels now displayed). No DB changes, no RLS changes, no data mutations.

---

## KB changes shipped

- `unicorn-kb/reference/notification-system-behavior.md` — new reference doc covering the `emit_notification` error behavior change and the drift signal fix. See KB PR for SHA.

---

## Open items

- Legacy `public.notification_event_type` enum retained. Do not drop until Phase 3B, 3C, and 3D are complete and verified. Retention notice is on the DB object itself (`COMMENT ON TYPE`).
- Phase 3B (`notification_status` → `dd_notification_status`) not yet started.
- Phase 3C (`notification_delivery_target` → `dd_notification_delivery_target`) not yet started.
- Phase 3D (`notification_integration_status` → `dd_notification_integration_status`) not yet started.
