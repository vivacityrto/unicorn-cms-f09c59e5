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

## Update 2026-10-09 — Integrator and BGT can register for Teams events
- Decision (Carl, 9 October 2026): Beverly and Novea run Teams webinar registration, and they hold the
  **Integrator** and **BGT** roles. `teams_events.manage_registrations` is therefore seeded `full` for
  Super Admin, Integrator and BGT; Team Leader, CSC and CET stay `none`. This supersedes the "everyone
  else none" seed described above.
- The migration `20261008010000_teams_event_registration_foundation.sql` was edited in place. It had not
  been applied to any hosted project at the time, so no data migration is involved. If it had already been
  applied somewhere, those rows would need a follow-up upsert instead.
- No other access change was needed. The Administration sidebar section is already shown to all Vivacity
  staff roles (`isVivacityTeam`, which includes Integrator and BGT) and Contact Directory has no extra
  role flag. The `/administration/contacts` route uses `allowVivacityTeam`. The Contact Directory Groups
  tables and the Teams batch tables are readable by these roles (`is_vivacity_staff` /
  `check_permission`), and every Edge Function re-checks the permission through `requireCaller`.
