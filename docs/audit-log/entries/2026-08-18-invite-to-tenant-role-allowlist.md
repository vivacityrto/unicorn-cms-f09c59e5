# Audit: 2026-08-18 — invite-to-tenant role allowlist, broken CORS, and link logging

**Trigger:** ADR-driven (continuing the 2026-08-18 handoff's "high-risk
carryovers" — `generate-recovery-link` and `invite-to-tenant`: add CORS/role
controls, stop logging links or secrets, validate recipient/role allowlists).
**Scope:** `invite-to-tenant` only. `generate-recovery-link` was reviewed
in the same pass and found already compliant (gated on
`admin.team_users.manage` full, request-aware CORS via `corsHeaders(req)`,
does not log the generated link) — no changes needed there.

## Findings

- **Privilege escalation via unvalidated role.** `invite-to-tenant` accepts
  `role` directly from the request body and writes it to
  `user_invitations.unicorn_role` with no allowlist. Authorization is either
  `admin.invites.manage` (full) or `has_tenant_admin_safe` for the target
  tenant — but the tenant-admin path placed no ceiling on which role could be
  assigned. A tenant Admin (a legitimate, lower-privileged caller under this
  function's own authorization model) could submit `role: "Super Admin"` (or
  `"Team Leader"`, `"Integrator"`, etc.) and create a pending invitation for
  that elevated role; once accepted, the invitee would hold staff-level
  privileges. The codebase's other, more complete invite path
  (`supabase/functions/invite-user/index.ts`) already solves exactly this
  with a `CLIENT_ROLES = ["Admin", "User"]` allowlist enforced whenever the
  caller isn't Vivacity staff (line ~226) plus a DB trigger
  (`trg_enforce_invitation_role_ceiling`) as a backstop — `invite-to-tenant`
  had neither.
- **Broken CORS.** `corsHeaders` was imported from `_shared/cors.ts` (a
  function taking `req`) and used directly as a static headers object
  (`headers: corsHeaders`, `headers: { ...corsHeaders, ... }`) instead of
  being called. This produces the wrong headers on every response (the
  function's own enumerable properties, not built CORS headers) rather than
  a request-aware allowlist.
- **Plaintext invite link/token logged.** `console.log("Generated invite
  link:", inviteLink)` wrote the full accept-invitation URL — including the
  plaintext, unhashed invite token — to function logs on every successful
  invite. Anyone with edge-function log read access could use a logged token
  to accept the invitation as that invitee before the real recipient did.
- **No frontend caller found.** `grep -rn "invite-to-tenant" src/` returns no
  matches; `invite-user` is the function every invite UI in `src/` actually
  calls. Combined with a `query_logs` check showing 0 hits against this
  function's `function_id` in the last 24h, this function may be a legacy
  duplicate. Per the handoff's explicit guardrail ("Do not retire an Edge
  Function on the basis of no repository callers or a short quiet-log
  window"), it was **hardened in place, not retired** — no owner/operator
  confirmation of dead status was sought this session.

## Code changes (this entry accompanies PR — branch
`hotfix/invite-to-tenant-role-allowlist`)

- `supabase/functions/invite-to-tenant/index.ts`:
  - Added `CLIENT_ROLES = ["Admin", "User"]` and reject any other `role`
    with 403 `ROLE_NOT_ALLOWED`, checked before either authorization branch
    runs (so neither path can bypass it). This function has no
    `invite_as: "VIVACITY"` branch (unlike `invite-user`), so it is
    tenant-scoped by construction and should never accept a staff role;
    callers needing to invite Vivacity staff must use `invite-user`.
  - Fixed CORS: `corsHeaders` import aliased to `buildCorsHeaders`, with a
    per-request `const corsHeaders = buildCorsHeaders(req)` built once at
    the top of the handler. Every existing `...corsHeaders` spread now
    receives the real allowlisted headers object instead of a function
    reference.
  - Replaced the link-logging line with a log that names the recipient and
    tenant but never the link or token.
- `supabase/functions/invite-to-tenant/role-allowlist.test.mjs` (new):
  static source-regression test asserting the allowlist exists and is
  checked before either authorization path, that CORS is built per-request,
  and that the plaintext link is never logged.

## Verification

- `node --test supabase/functions/invite-to-tenant/role-allowlist.test.mjs`
  — 4/4 passing.
- No production deploy performed as part of this entry — the function
  remains on its previously-deployed (vulnerable) version in production
  until this PR is reviewed and Carl explicitly authorizes
  `deploy_edge_function`.

## Decisions

- Chose to harden rather than retire, per the handoff's standing guardrail
  against retiring on log-silence/no-caller evidence alone.
- Matched `invite-user`'s existing `CLIENT_ROLES` convention exactly rather
  than inventing a new role list, so the two functions can't drift apart on
  what "client-safe" means.

## Follow-up finding: the DB trigger is not actually a backstop for either function

Checked `enforce_invitation_role_ceiling()` (the function behind
`trg_enforce_invitation_role_ceiling`, `BEFORE INSERT OR UPDATE ON
public.user_invitations`) via `pg_get_functiondef`. Its first statement:

```sql
IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
  RETURN NEW;
END IF;
```

Every edge function that inserts into `user_invitations` — `invite-user`,
`invite-to-tenant`, and this fix's target — does so using the service-role
key. That means the trigger **unconditionally exempts every edge-function
insert**, including the one this entry just fixed. It only protects a
hypothetical direct PostgREST/RLS-context write from an authenticated
frontend session, which is not how either invite path actually writes. So:

- `invite-to-tenant`'s missing `CLIENT_ROLES` check before this fix was not
  defense-in-depth-minus-one-layer — it was the **only** check. The
  privilege-escalation path described above was real and exploitable, not
  theoretical.
- `invite-user`'s existing `CLIENT_ROLES` allowlist (line ~226) is, by the
  same reasoning, also the **only** protection on that path — its own
  docstring's claim that the trigger "mirrors this for direct PostgREST
  writes" is accurate but does not cover the edge-function path at all.
- The trigger as written provides essentially no protection today, since
  there does not appear to be any live path that inserts into
  `user_invitations` as an authenticated (non-service-role) caller. Not
  fixed in this entry (out of scope: this PR is the `invite-to-tenant` app
  layer fix); flagged as a real follow-up below.

## Open questions parked

- Whether `invite-to-tenant` should eventually be retired in favor of
  `invite-user` is a real question (duplicate surface, same failure mode
  the handoff flags for `assign-package-to-tenant` and
  `backfill-vimeo-durations`) — not decided here; needs owner/operator
  confirmation per the handoff's retirement guardrail, not just this
  session's grep/log check.
- **`enforce_invitation_role_ceiling`'s `service_role` bypass should be
  reconsidered.** As written it cannot stop a bug in any future edge
  function (or a compromised/modified one) from inserting an elevated-role
  invitation, since the one gate that would matter is the one it skips.
  A stronger version would check the ceiling unconditionally and rely on
  each edge function's own `auth.getUser`-verified caller for the
  "who is asking" context, rather than trusting the Postgres role the
  connection authenticated as. This is a genuine follow-up, not actioned
  in this PR — it touches a `SECURITY DEFINER` trigger function, needs its
  own migration, PR, and audit entry per `AGENTS.md`'s schema/trigger rule.
