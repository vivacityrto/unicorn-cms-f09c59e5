# Audit: 2026-05-20 — last-sign-in-at-sync

**Trigger:** Lovable production DB change session — extending an
existing trigger function + idempotent data backfill.

**Scope:** `public.handle_user_login()` function body + backfill of
`public.users.last_sign_in_at`. Investigated all readers/writers of
`public.users.last_sign_in_at`, the existing `auth.users` trigger
landscape, and the auth → public cross-boundary visibility constraint
that motivated the fix. Did NOT investigate: other auth columns that
may need similar mirroring (parked).

## Findings

- **"Last active" column on `/client/users` showed "Never" for every
  user** despite recent sign-ins. Root cause: `v_client_tenant_users`
  reads `u.last_sign_in_at` from `public.users`, which is a separate
  column from `auth.users.last_sign_in_at`. The public column was
  seeded once and never re-synced.

- **`auth.users` cannot be joined from a `security_invoker = true`
  view to bypass the issue.** RLS on `auth.users` restricts
  `authenticated` to their own row only — a client-side view join
  would resolve to one row, not the team's. Fixing at the view layer
  was therefore impossible without `SECURITY DEFINER` machinery.

- **A trigger function (`handle_user_login`) on `auth.users` already
  detected the exact event we cared about.** It already fired AFTER
  UPDATE on `auth.users` and already guarded on
  `IS DISTINCT FROM`, used to insert into `public.user_activity`.
  Extending it was cleaner than adding a parallel trigger — single
  guard, no new DDL lock on `auth.users`, single SECURITY DEFINER
  code path.

- **Drift was 28 rows of 35 joined auth↔public users (≈80%).** The
  in-sync 100 of 109 reported in our initial estimate was a narrower
  scope (active-only). Full join including all statuses showed the
  drift was much wider.

- **Function hardening upgrade in flight.** The existing
  `handle_user_login` ran with `SET search_path = 'public'` (the
  legacy P1-e setting). This session upgraded it to
  `SET search_path = ''` per the current project standard, with
  every reference (`public.user_activity`, `public.users`)
  schema-qualified.

## KB changes shipped

- `unicorn-kb @ <branch:kb/auth-public-mirror-pattern>`:
  `pinned/conventions.md` gains a new subsection "Auth columns
  visible across tenant boundaries (mirror via trigger, don't
  view-join)" capturing the pattern for the next dev who needs to
  surface another `auth.*` column.

## Codebase observations

- `unicorn-cms-f09c59e5 @ d1881f5f` ("Backfilled last_sign_in_at" —
  origin/main, includes the function-body amend + backfill).
- Migration: extends `public.handle_user_login()` to also UPDATE
  `public.users.last_sign_in_at = NEW.last_sign_in_at` inside the
  existing `IS DISTINCT FROM` guard; tightens `search_path` to `''`;
  schema-qualifies all references; `REVOKE ALL ... FROM PUBLIC`.
  Idempotent backfill UPDATE runs in the same migration. No new
  trigger DDL — existing `on_auth_user_login` already wired to the
  amended function.
- Frontend: no changes. View: no changes. Type regen: not required.

## Decisions

- **D1 — Extend `handle_user_login`, do not create a new trigger.**
  Single function, single guard, no new `CREATE TRIGGER` lock on
  `auth.users`.
- **D2 — NULL handling: mirror source verbatim.** The `IS DISTINCT
  FROM` guard already skips NULL→NULL no-ops; no extra NULL check.
- **D3 — Accept the `updated_at` bump from
  `update_users_updated_at` BEFORE UPDATE trigger.** Semantically
  correct — the user record IS being touched on login. Suppression
  options (`session_replication_role = replica`) judged
  heavy-handed.
- **D4 — Backfill scope: full sweep** via
  `pu.last_sign_in_at IS DISTINCT FROM au.last_sign_in_at`. 28 rows
  touched, idempotent, safe to rerun.
- **D5 — Other auth columns (`email_confirmed_at`, etc.) out of
  scope.** Pattern is now documented; future syncs can follow it.

## Open questions parked

- **Other `auth.users` columns that may need the same treatment.**
  Candidates: `email_confirmed_at`, `phone_confirmed_at`, MFA
  state. None currently surfaced on the client portal that we
  noticed in scope. Future product needs may want this; the KB
  pattern note captures the approach.
- **`ManageInvites` admin-SDK fetch from `auth.users`** still
  bypasses the public column. Now redundant (the sync makes the
  public column accurate). Consider migrating it to read from
  `public.users` next time the file is touched. Low priority —
  current behaviour works.

## Tag

audit-2026-05-20-last-sign-in-at-sync
