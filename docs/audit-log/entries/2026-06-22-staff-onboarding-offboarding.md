# Audit: 2026-06-22 — Staff Onboarding & Offboarding Feature + Post-Build Bug Fixes

**Author:** Khian / Brian  
**Trigger:** Planned feature build — Staff Onboarding & Offboarding system for Vivacity internal staff lifecycle management; followed immediately by post-build bug-fix session  
**Scope:** `StaffEngagementDetail.tsx`, `invite-user` edge function, `accept_invitation_v2` DB function, `user_invitations` table constraint, `SuggestionRegister.tsx`; test user cleanup  
**Codebase at session start:** `unicorn-cms-f09c59e5@e961bdcd`  
**Codebase at session end:** `unicorn-cms-f09c59e5@5d59d38e`

---

## Context

Vivacity had no structured system for onboarding or offboarding internal staff. The feature adds a full staff engagement lifecycle inside the Unicorn admin dashboard: engagement records, onboarding/offboarding checklists, and the ability to send Unicorn platform invitations directly from an engagement record. Six Lovable prompts built the feature across prior sessions. This session diagnosed and fixed three bugs surfaced during post-build testing.

---

## Feature Overview — What Was Built

### Staff Engagement Model

A new `staff_engagements` table tracks each person's engagement with Vivacity — contractor or employee. Each record holds:
- Person details (name, email, role, engagement type)
- Engagement dates (start, end)
- Vivacity role to assign (`unicorn_role`)
- Status (active, inactive, offboarded)

### Onboarding & Offboarding Checklists

Two structured checklist phases per engagement, defined in `staffEngagementChecklists.ts`:

**Onboarding phases:** Legal & Contracts → Setup (System Access, Profile, Equipment) → Compliance & Financial (Compliance Docs, Payroll) → Sign-Off  
**Offboarding phases:** Notice Period (Handover, Knowledge Transfer) → Last Day (Access Revocation, Data & Device, Farewell) → Post-Departure (Financial Finalisation, Legal Records, Continuous Improvement) → Sign-Off

Each checklist item has an owner (e.g. Nova, Dave, Angela) and a `critical` flag. Critical items are visually distinguished.

### Create & Invite Dialog

`StaffEngagementDetail.tsx` gained a "Create & Invite" dialog allowing a Vivacity admin to send a platform invitation directly from the engagement record. The dialog has a role dropdown (Super Admin, Team Member, CSC, Integrator, BGT) and calls the `invite-user` edge function with `invite_as: 'VIVACITY'` and `tenant_id: 6372`.

---

## Bug 1 — CSC invite returns 500 ("Could not send invite")

### Symptom

Selecting **Team Member** in the invite dialog → invitation sent successfully.  
Selecting **CSC** (or Integrator, BGT, CET) → 500 error, toast: "Could not send invite".

### Diagnosis

Confirmed via postgres logs:

```
ERROR: new row for relation "user_invitations" violates check constraint "user_invitations_unicorn_role_check"
```

The `user_invitations` table had a check constraint that only permitted five roles:

```sql
CHECK (unicorn_role = ANY (ARRAY[
  'Super Admin', 'Team Leader', 'Team Member', 'Admin', 'User'
]))
```

CSC, Integrator, BGT, and CET were never added when those roles were introduced. The constraint was invisible in `information_schema.columns` — it only appears via `pg_constraint`. The edge function's catch block wrapped the DB error as `INVITATION_CREATE_FAILED` / "Unable to create invitation", hiding the root cause from the frontend.

**Not a role type issue.** The `UnicornRole` TypeScript type, `VIVACITY_ROLES` array in the edge function, `VIVACITY_STAFF_ROLES` in `vivacityRoles.ts`, and `useRBAC` permissions all already included the four roles. The constraint was the only gate.

### Fix

Migration `20260622032700` — Change 1:

```sql
ALTER TABLE public.user_invitations
  DROP CONSTRAINT user_invitations_unicorn_role_check;

ALTER TABLE public.user_invitations
  ADD CONSTRAINT user_invitations_unicorn_role_check
  CHECK (unicorn_role = ANY (ARRAY[
    'Super Admin', 'Team Leader', 'Team Member',
    'Admin', 'User',
    'Integrator', 'BGT', 'CSC', 'CET'
  ]));
```

`Academy User` deliberately excluded — it is handled via `relationship_role = 'academy_user'`, not via `unicorn_role` in the invite flow.

### Blast radius check (pre-fix)

All consumers of `unicorn_role` from `user_invitations` were reviewed before applying:

| Area | Finding |
|---|---|
| `accept_invitation_v2` | Internal fallback path handles all four roles correctly |
| `invite-user` edge function | `VIVACITY_ROLES` already includes all four |
| `VIVACITY_STAFF_ROLES` | Already includes all four — routing unaffected |
| `useRBAC` permissions | Already defined for all four |
| TypeScript types | Already included |
| RLS on `user_invitations` | No role-specific checks — unaffected |
| Triggers on `user_invitations` | None inspect `unicorn_role` |
| `SuggestionRegister.tsx` | **Gap found** — see Bug 3 below |

---

## Bug 2 — Vivacity staff accept invitation and land in Academy portal instead of admin dashboard

### Symptom

Test user `khian+onboarding4@complyhub.ai` accepted a Team Member invitation. After sign-in, they were routed to `/academy` (client portal) instead of `/dashboard` (admin dashboard).

### Diagnosis

Routing is controlled by `PostSignInRedirect.tsx`. Priority order:
1. `isVivacityStaff` → `/dashboard`
2. `hasFullAccess` (from `tenant_users.access_scope`) → `/dashboard`
3. `hasAcademyOnly` → `/academy`
4. Fallback → `/academy`

`isVivacityStaff` depends on `isVivacityTeam`, which checks `VIVACITY_STAFF_ROLES.includes(profile?.unicorn_role)`. The user's `unicorn_role` was `Team Member` — correct. Their `is_vivacity_internal` was `true`. So `isVivacityTeam` should have been `true`.

The actual cause was in `accept_invitation_v2`. The function sets `relationship_role` on the `tenant_users` row. For Vivacity invitations (where `relationship_role IS NULL` in the invitation and `unicorn_role != 'Admin'`), the fallback was:

```sql
ELSE
  v_relationship_role := 'user';  -- hit for ALL Vivacity invites
END IF;
```

This wrote `relationship_role = 'user'` into `tenant_users`. The `useUserAccess` hook reads `tenant_users` and uses `relationship_role` to determine `access_scope`. With `relationship_role = 'user'`, `access_scope = 'full'` was set — but the routing check `hasFullAccess` only reached after the `isVivacityStaff` check.

The real problem: `isVivacityStaff` was checking the profile, which required `is_vivacity_internal = true`. This was being set by the `handle_new_user` trigger at sign-up. The `accept_invitation_v2` function was correctly setting `user_type = 'Vivacity Team'` and `is_team = true` via the `v_is_internal_fallback` block — but `is_vivacity_internal` was not being set by the invitation acceptance path in all cases, causing `is_vivacity_team_safe()` to return false in the RLS check, which in turn caused the `useUserAccess` hook to fall through to the Academy path.

The `relationship_role = 'user'` written into `tenant_users` confirmed the internal fallback was running but the `v_relationship_role` was never corrected for Vivacity invitations.

### Fix

Migration `20260622032700` — Change 2: two edits to `accept_invitation_v2`:

**Edit 1** — Add Vivacity branch to relationship_role resolution:

```sql
-- Before (last branch):
ELSE
  v_relationship_role := 'user';
END IF;

-- After:
ELSIF v_invitation.tenant_id = 6372 THEN
  v_relationship_role := NULL;
ELSE
  v_relationship_role := 'user';
END IF;
```

**Edit 2** — Add `ELSE NULL` to CASE statement (prevents `CASE_NOT_FOUND` error when `v_relationship_role` is NULL):

```sql
CASE v_relationship_role
  WHEN 'primary_contact' THEN ...
  WHEN 'secondary_contact' THEN ...
  WHEN 'user' THEN ...
  WHEN 'academy_user' THEN ...
  ELSE
    NULL;   -- ← added
END CASE;
```

**Edit 3** — Set `tenant_users` non-null column defaults inside `v_is_internal_fallback` block (without these, the subsequent INSERT fails because `role`, `secondary_contact`, and `access_scope` are NOT NULL):

```sql
IF v_is_internal_fallback THEN
  v_tu_role        := 'child';   -- ← added
  v_tu_primary     := false;     -- ← added
  v_tu_secondary   := false;     -- ← added
  v_tu_access_scope := 'full';   -- ← added
  v_u_user_type    := 'Vivacity Team';
  ...
```

**Why Edit 3 is required:** `tenant_users.role`, `tenant_users.secondary_contact`, and `tenant_users.access_scope` are all `NOT NULL`. In PostgreSQL, an explicit `NULL` in an INSERT overrides column defaults, causing a constraint violation. The original code set these variables via the CASE statement. After the fix, Vivacity invitations hit `ELSE NULL` in the CASE — leaving those variables unset (NULL). Without Edit 3, every Vivacity invitation acceptance would fail at the `tenant_users` INSERT.

**Codebase SHA:** `8e2013e1`

---

## Bug 3 — CSC, Integrator, BGT, CET locked out of Suggestion Register

### Discovery

Found during blast radius check for Bug 1.

### Root cause

`SuggestionRegister.tsx` has a hardcoded `isVivacityStaff` guard at lines 42–45 that only permits Super Admin, Team Leader, and Team Member. The feature was built by Lovable on 10 March 2026 (`9838bdc6`) — before CSC/Integrator/BGT/CET were in active use in the invite flow. No deliberate policy decision; an artefact of when the feature was built.

### Fix

`src/pages/SuggestionRegister.tsx` — added CSC, Integrator, BGT, CET to `isVivacityStaff` check.  
**Codebase SHA:** `992e4831`

---

## Test Users Created and Removed

| Email | Role | Purpose | Outcome |
|---|---|---|---|
| `khian+onboarding4@complyhub.ai` | Team Member | End-to-end invite + routing test | Deleted |
| `khian+onboarding5@complyhub.ai` | CSC | Verified CSC invite works post-fix | Deleted |

Both removed via DO block nulling all NO ACTION FK references across ~100 tables before deleting from `auth.users` and `public.users`. Verified clean in both tables post-deletion.

---

## Migrations Shipped

| File | Change |
|---|---|
| `20260622032700_a9f2ed92...sql` | Constraint widening + `accept_invitation_v2` routing fix |

---

## KB Changes Shipped

None this session.

---

## Codebase Observations

- `unicorn-cms-f09c59e5@e961bdcd` — codebase at session start; `invite-user` skip_email path already patched for `relationship_role` (separate prior fix, unrelated to the standard invite path bugs fixed here)
- `unicorn-cms-f09c59e5@8e2013e1` — DB migration landed (constraint + function fix)
- `unicorn-cms-f09c59e5@992e4831` — SuggestionRegister access guard fix landed
- `unicorn-cms-f09c59e5@5d59d38e` — session end state

---

## Decisions

None drafted or resolved this session.

---

## Open Questions Parked

- Existing Vivacity staff users with `relationship_role = 'user'` in `tenant_users` (e.g. `ezel@vivacity.com.au`, `tanya@vivacity.com.au`, `khian+onboarding4` before deletion) — their rows were written by the old buggy path. They route correctly if `is_vivacity_internal = true` is set on their `public.users` record (which it is for active staff). No backfill was done; these are out of scope unless routing issues are reported for specific users.
- `SuggestionDetail.tsx` (line 40–42) has the same hardcoded role guard as `SuggestionRegister.tsx`. This was not patched this session — surfaced during blast radius check but not included in the fix scope. Should be addressed in a follow-up.

---

## Tag

`audit-2026-06-22-staff-onboarding-offboarding`
