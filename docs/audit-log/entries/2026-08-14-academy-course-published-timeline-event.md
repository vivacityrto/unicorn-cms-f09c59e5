# Audit: 2026-08-14 — Academy course-publish surfaced as a Client Activity timeline event

**Trigger:** ad-hoc — Carl asked for course publishing (an internal staff action) to show in the Client Activity dashboard.
**Scope:** a new `academy_courses` publish trigger and the new `academy_course_published` event type. Did not touch the existing enrollment/mandatory-autoenrol triggers from the same day's earlier entries.

## Findings

- Publishing a course is an internal staff action with no client tenant of its own, but the Client Activity dashboard (`usePortfolioTimeline`) is tenant-scoped by design — every row needs a `tenant_id`.
- `tenants.is_system_tenant` already exists and is set on exactly one row: `Vivacity Coaching & Consulting` (id 6372) — the correct, existing designation for "this is Vivacity's own internal tenant," not something built for this change. Used that instead of hardcoding the tenant id.
- While rebuilding the `timeline_valid_event_type` CHECK constraint (required to add the new value), found the *live* constraint already allows 4 event types not present in `src/types/timeline.ts`'s `TIMELINE_EVENT_TYPES`: `action_item_comment`, `package_status_changed`, `audit_created`, `audit_completed` — pre-existing live-vs-git drift, same pattern as the `delete_document_cascade` drift documented on 2026-08-12. Preserved all of them as-is in the new constraint; did not investigate or reconcile further (out of scope for this change).

## Code changes (this entry accompanies one)

- Migration `20260814020000_academy_course_published_timeline_event.sql` (applied via `apply_migration`):
  - Added `academy_course_published` to the `timeline_valid_event_type` CHECK constraint (rebuilt with the full live list, including the 4 drifted values above, to avoid narrowing it).
  - New trigger `trg_academy_course_published_timeline` / function `fn_academy_course_published_timeline_trigger`, `AFTER INSERT OR UPDATE ON academy_courses`: fires on any transition into `status = 'published'`, resolves the system tenant via `is_system_tenant = true`, and inserts one `client_timeline_events` row attributed to that tenant — `created_by`/attribution comes from the course's own `published_by` (reliable — set by the real publish action, unlike `academy_enrollments.enrolled_by`), title `"{publisher name} published {course title}"`, `visibility` defaults to `'internal'` (matching every other Academy timeline event — not client-visible).
- `src/types/timeline.ts`: added `academy_course_published` to `TIMELINE_EVENT_TYPES`.
- `src/components/client/TimelineEventCard.tsx`: added an icon (`Rocket`) and color (teal) for the new type to the exhaustive `EVENT_ICON_MAP`/`EVENT_COLOR_MAP`.
- `src/hooks/useClientManagementData.tsx`: added the new type to the `academy` category filter (`EVENT_TYPE_FILTERS`).

## Verification (no permanent side effects)

- Inserted a real, disposable course directly with `status = 'published'` and a real `published_by` (Angela Connell-Richards) — a genuine trigger fire, not a rollback test, since the intended effect (one timeline row) is itself the thing being verified.
- Confirmed the resulting `client_timeline_events` row: `tenant_id = 6372`, title `"Angela Connell-Richards published ZZZ_TEST_COURSE_PUBLISH_TIMELINE_DELETE_ME"`, correct `entity_type`/`entity_id`/`metadata`, `visibility = 'internal'`.
- Confirmed it renders correctly on the live `/client-activity` page: "Vivacity Coaching & Consulting" heading, "Internal" badge, correct title, grouped under "Today".
- Deleted the scratch course and its timeline row immediately after; verified both back to zero.

## Decisions

- Used `tenants.is_system_tenant` to resolve the attribution tenant dynamically rather than hardcoding tenant id 6372, so this keeps working if the designated system tenant ever changes.
- Left the pre-existing `action_item_comment`/`package_status_changed`/`audit_created`/`audit_completed` live-vs-git drift untouched — noted, not reconciled, consistent with this being a narrowly-scoped addition.

## Open questions parked

- Should the same live-vs-git drift on `timeline_valid_event_type` (4 values missing from `src/types/timeline.ts`) get its own reconciliation entry, similar to the 2026-08-12 `delete_document_cascade` one?
