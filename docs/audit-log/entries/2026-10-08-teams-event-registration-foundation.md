# Audit: 2026-10-08 — teams-event-registration-foundation

**Trigger:** ad-hoc (implementation of `Unicorn_2_Teams_Event_Registration_Technical_Requirements`,
issued 8 October 2026; schema, RLS and Edge Function work)
**Scope:** everything in the brief that does not need the Microsoft 365 tenant: the RBAC feature,
the batch/item tables and their RLS, five Edge Functions, the shared Graph/membership/token/
processor modules, and the Contact Directory "Register for Teams Event" modal. Did **not** touch
the live Microsoft 365 tenant, any Graph call against real data, or Teams Meetings (deferred, see
open questions). Nothing here has run against a real webinar yet.

## Findings
- The Contact Directory Groups tables (`tenant_contact_groups`, `tenant_contact_group_members`,
  migration `20260825060000`) already exist and were built as groundwork for this feature. Members
  reference `tenant_users.id` (users) or `tenant_contacts.id` (contacts) as text. They stay the
  only source of group membership; the new tables hold a processing snapshot only.
- The brief names `audit_log` for audit writes. That table is not in the generated types and is
  only referenced by a swallowed `try/catch` insert in `mailgun-send`. Audit entries are written to
  `client_audit_log` (nullable `tenant_id`, `details jsonb`) instead, matching `tenant-lifecycle`
  and `send-broadcast-campaign`. Counts and ids only; the contact list stays in the secured items
  table.
- Microsoft Graph behaviours that differ from, or are not stated in, the brief (from the Graph v1.0
  docs, 8 October 2026; all still to be proven in the live tenant):
  - App-only `POST .../registrations` returns **204 No Content** (no registration id). The brief's
    `graph_registration_id` therefore stays NULL until a list-registrations lookup is added.
  - `GET /solutions/virtualEvents/webinars` returns only webinars whose **organiser has been granted
    a Teams application access policy**; without it the call fails with "No application access
    policy found for this app". Policy changes take up to 30 minutes. The policy also covers online
    meetings, which is why a dedicated Entra app is the right shape.
  - Microsoft's examples send Windows zone names (`"Pacific Standard Time"`) and lower-case language
    tags. Registrations send `AUS Eastern Standard Time` / `en-AU` (overridable via
    `TEAMS_EVENTS_PREFERRED_TIMEZONE` / `_LANGUAGE`); `Australia/Sydney` may be rejected.
  - List webinars supports only `$count`, so the 14-day window is filtered server-side.
- The read-only Supabase MCP connected in this session points at project `gdwhlstfguxarnxasrrs`,
  not this repo's `yxkgdalkbrriasiyyrwk` (`supabase/config.toml`), and its schema differs
  (`role_permissions` uses `feature_id`, no `permission_features`/`client_audit_log`). It was **not**
  used as evidence; conventions were taken from the repo's migrations and generated types instead.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- Migration `20261008010000_teams_event_registration_foundation.sql` (**written, not yet applied to
  any hosted project**; apply via the Supabase MCP after review, then regenerate types):
  - seeds `teams_events.manage_registrations` (Super Admin `full`; Team Leader/Integrator/BGT/CSC/CET
    `none`, matching `admin.broadcast.send`);
  - `teams_event_registration_batches` and `teams_event_registration_items` with RLS enabled,
    **SELECT-only** policies gated on `is_super_admin_safe` or the new permission, and
    `REVOKE ALL ... FROM anon, authenticated` + `GRANT SELECT` so browser roles cannot write even if
    a policy is added later. All writes are service-role from the Edge Functions. Client tenants
    have no path to either table;
  - database-enforced idempotency: one live (`queued`/`processing`) batch per event + group
    (`uq_teams_event_batches_live_lock`), one success row per `event_type + graph_event_id +
    normalised_email` across all batches (`uq_teams_event_items_event_email_success`), and one
    person per batch (`uq_teams_event_items_batch_email`).
- Edge Functions (new, all gated by `requireCaller` + `teams_events.manage_registrations` before any
  database or Graph work): `list-teams-events`, `preview-teams-event-group`,
  `register-teams-webinar-group`, `get-teams-event-batch`, `retry-teams-event-failures`. Shared code
  in `supabase/functions/_shared/teams-events/`. No `config.toml` entries (gateway `verify_jwt`
  stays at its default, the browser sends the user JWT).
  - The browser sends only an event id, a group id and a signed preview token. The group is
    re-resolved and its membership fingerprint re-checked on the server; a changed membership is a
    409 `membership_changed`, an expired preview a 410.
  - Graph credentials are the dedicated secrets `TEAMS_EVENTS_TENANT_ID`, `TEAMS_EVENTS_CLIENT_ID`,
    `TEAMS_EVENTS_CLIENT_SECRET` (names only here; values live in Supabase). Deliberately not the
    SharePoint app's `MICROSOFT_*` secrets. Preview tokens are HMAC-signed with a key derived from
    the service-role key, so no extra secret is needed.
  - Bulk processing: 5-way concurrency, `Retry-After` honoured, capped exponential back-off for
    transient failures only, an event-level circuit breaker (3 consecutive consent / organiser-policy /
    event-closed failures fail the rest immediately without calling Graph), 120 s processing
    deadline, per-person persistence, heartbeat, stale-lock release after 3 minutes, and a rate limit
    of 10 batches per operator per 10 minutes.
  - Retry re-runs failed and still-pending people only and never `invalid_contact_data` failures.
- Frontend: `RegisterTeamsEventDialog` / `TeamsEventBatchResults`, `teamsEventsService`,
  `useTeamsEventRegistration`, `src/lib/teamsEvents/format.ts`; `ContactDirectory.tsx` gains an
  Actions menu, shown only when the user holds the permission (UI gate only).
- Tests: 36 unit tests (`teams-events.node-test.ts`) and 30 source-pattern guards
  (`teams-events-static.test.mjs`) in the Edge suite; 5 formatting tests in the frontend suite.
  Edge functions were also type-checked with a throwaway Deno-stub tsconfig (Deno is not installed
  locally), which is not part of CI.

## Decisions
- Eligibility: a member is eligible only if active (not disabled/archived, record exists), has a valid
  email **and both first and last name** (Graph requires both for app-only registration; nothing is
  invented). Users win over contacts when two members share an email.
- `skipped_count` = already registered + excluded + duplicate; `submitted_count` = sent to Graph.
- Meetings ship after webinars, per the brief's recommendation; `meeting` is rejected with a clear
  501 for now and the Meetings tab is disabled.

## Open questions parked
- **Prerequisites owned by a Microsoft 365 administrator** (Dave Richards): the Entra app
  registration, the two application permissions and admin consent, the application access policy
  for each organiser, the three Supabase secrets, organiser accounts, and the confirmation-email
  standard. Until then the functions return 503 `not_configured`.
- Apply the migration (and regenerate `src/integrations/supabase/types.ts`) — pending approval.
- Live verification to do: organiser visibility of webinars, time zone/language format, behaviour on
  an already-registered email, registration questions endpoint
  (`registrationConfiguration/questions`) and `isRequired`, approval/waitlist settings, whether
  Graph-created registrants receive Teams emails, and the confirmation-email standard.
- Registration id lookup (list registrations) and a stable v1.0 duplicate lookup are not
  implemented; duplicates rely on local success records plus a duplicate response from Graph.
- Joined URLs are not stored (`graph_join_url_encrypted` exists, unused) pending a business need.
- No "recent batches" screen yet: a batch can only be reopened from the modal that started it.
- Teams Meetings (`invite-teams-meeting-group`, `Calendars.Read` / `Calendars.ReadWrite`) is Phase 2
  and needs Exchange-side application scoping before `Calendars.ReadWrite` is granted.

## Update 2026-10-09 — reuse the existing Microsoft app (supersedes the credentials notes above)
- Decision (Carl, 9 October 2026): the Teams event functions authenticate as the **existing** Entra app
  Unicorn already uses for SharePoint (`MICROSOFT_TENANT_ID` / `MICROSOFT_CLIENT_ID` /
  `MICROSOFT_CLIENT_SECRET`) instead of a new dedicated app. The notes above that call for a dedicated
  app and the three `TEAMS_EVENTS_*` secrets describe the original design and no longer apply by default.
- Code: `_shared/teams-events/credentials.ts` (`resolveTeamsGraphCredentials`) picks the credentials.
  Default is the `MICROSOFT_*` set. A complete `TEAMS_EVENTS_*` set, if ever configured, takes precedence so
  a dedicated app can be swapped in with no code change; a partly set `TEAMS_EVENTS_*` set is treated as not
  configured rather than mixed with the shared credentials.
- Administrator work shrinks to: add `VirtualEvent.Read.All` and
  `VirtualEventRegistration-Anon.ReadWrite.All` (application permissions) to the existing app, grant admin
  consent, and grant the Teams application access policy to each organiser using the existing app's client
  ID. No new app, client secret or Supabase secrets.
- Trade-offs accepted: one credential now powers SharePoint, staff Outlook sign-in and Teams registrations,
  so its secret expiry or rotation affects all three; `VirtualEvent.Read.All` is tenant-wide read access to
  webinars on that app; and the application access policy also covers online meetings for that app, which
  matters when Meetings (Phase 2) are added.
- Follow-up: check the existing client secret's expiry date before relying on it.

## Update 2026-10-09 — Integrator and BGT can register for Teams events
- Decision (Carl, 9 October 2026): Beverly and Novea run Teams webinar registration, and they hold the
  **Integrator** and **BGT** roles. `teams_events.manage_registrations` is therefore seeded `full` for
  Super Admin, Integrator and BGT; Team Leader, CSC and CET stay `none`. This supersedes the "everyone
  else none" seed described above.
- Implemented as a new corrective migration, `20261009010000_teams_events_grant_integrator_bgt.sql`, because the
  migration guardrail rejects edits to an existing migration file. It runs `UPDATE ... SET level = 'full'` for
  exactly the Integrator and BGT rows the foundation migration seeds as `none`, guarded with `level = 'none'` so
  it never overrides a level set by hand. It must be applied after the foundation migration (timestamp order
  guarantees this). A short-lived allowlist entry covers the data mutation; remove it once applied.
- No other access change was needed. The Administration sidebar section is already shown to all Vivacity
  staff roles (`isVivacityTeam`, which includes Integrator and BGT) and Contact Directory has no extra
  role flag. The `/administration/contacts` route uses `allowVivacityTeam`. The Contact Directory Groups
  tables and the Teams batch tables are readable by these roles (`is_vivacity_staff` /
  `check_permission`), and every Edge Function re-checks the permission through `requireCaller`.

## Update 2026-10-09 — migrations applied
- Both migrations (`20261008010000_teams_event_registration_foundation` and
  `20261009010000_teams_events_grant_integrator_bgt`) were applied to the Unicorn project
  (`yxkgdalkbrriasiyyrwk`) on 9 October 2026 via the Supabase MCP, foundation first. Pre-checks confirmed the
  target columns, the `(role, feature_key)` unique constraint, the `full`/`none` levels, the six roles, the
  helper functions and the bigint key types; neither table nor the feature existed beforehand.
- Verified afterwards: `teams_events.manage_registrations` is Super Admin / Integrator / BGT `full` and Team
  Leader / CSC / CET `none`; both tables have RLS enabled with a single SELECT policy each; browser roles hold
  only SELECT (no write grants); all three idempotency indexes exist. The permission tables'
  `log_permission_change` triggers recorded the seed rows.
- Recorded under the applied names `teams_event_registration_foundation` and `teams_events_grant_integrator_bgt`
  (the Supabase MCP assigns its own version timestamps).
- Follow-up PR: the two new tables were added to `src/integrations/supabase/types.ts` (written in the
  generator's format rather than regenerated, to avoid pulling the whole 50k-line file through a tool call), and
  the two temporary migration-safety allowlist entries for these migrations were removed as planned.
- Still outstanding: the Microsoft 365 administrator work, and live verification against a real webinar.

## Update 2026-10-09 — event-only additions and skips (PR 2 of 3)
- Requested by Carl: add a person to ONE event without adding them to the Contact Directory Group, and skip a
  Group member for ONE event while they stay in the Group. New people are created through the same flow as a
  client's own contact list (a client is required).
- Database: migration `20261009020000_teams_event_items_inclusion.sql` adds `teams_event_registration_items.inclusion`
  (`'group'` default, or `'extra'`, CHECK-constrained). Additive and backwards compatible: existing rows read
  `'group'`, and the previously deployed functions (which never write the column) keep working, so it can be applied
  before the new functions deploy. Rollback: `ALTER TABLE ... DROP COLUMN inclusion`. A skipped Group member is
  stored as an excluded row with `exclusion_reason = 'skipped_for_event'` (no schema change).
- Server (preview, register): the browser sends only lists of directory keys (`extra_member_keys`,
  `skipped_member_keys`, e.g. `user:12`, `contact:5`). Both lists are strictly validated (key format, caps of 200
  extras / 5,000 skips; a malformed list rejects the whole request). Every extra is re-resolved from the source
  tables and goes through exactly the same eligibility rules as a Group member (active, valid email, both names,
  duplicates by email). A skip applies only to a Group member. An extra who is already in the Group is not added
  twice. A record that no longer exists is dropped and counted.
- The signed preview token now binds the Group's membership fingerprint AND the extras and skips (extras prefixed
  `+`, skips `-`, and the count covers Group members plus extras), so changing either after the preview is a 409
  `membership_changed`. The audit `batch_started` entry gains `added_for_event_count` and
  `skipped_for_event_count` (counts only). The people themselves stay in the secured items table.
- UI: the modal gains "Include others in this event only" (directory search or a new contact, not added to the
  Group), and the preview gains "Skip for this event" / "Remove" and an "Undo" list; each change re-runs the preview
  and its signed token. Changing the Group clears the event-only changes.
- Deliberately not in this change: cancelling a Teams registration when someone is removed or skipped after they
  registered (PR 3). A skip applies to who is registered by this run; it does not touch an existing registration.
- Applied to the Unicorn project (`yxkgdalkbrriasiyyrwk`) on 9 October 2026 via the Supabase MCP, as
  `teams_event_items_inclusion`, **before** this change merged. Verified afterwards: the column is `text NOT NULL
  DEFAULT 'group'` with CHECK `inclusion IN ('group','extra')`, and all 3 pre-existing item rows read `'group'`.
  `src/integrations/supabase/types.ts` carries the column (hand-added in the generator's format).
