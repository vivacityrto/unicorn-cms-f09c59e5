# RBAC v5 Implementation Plan

> **Created:** 09 June 2026 | **Project:** Unicorn 2.0
> **Total Lovable prompts:** 26 | **Direct SQL steps:** 1
> **Status:** Shipped — all 8 phases done (see Phase tracking table below). Status line corrected 2026-07-31; previously read "In planning" despite the tracking table showing completion. Follow-on gaps (route-level guards, Stages module, RLS coverage, remaining raw role checks) are tracked in [`rbac-v6-gate-closure-plan.md`](rbac-v6-gate-closure-plan.md), not here.

---

## Design decisions confirmed

| # | Decision | Answer |
|---|---|---|
| 1 | Role name case convention | Title case — match existing (`'Super Admin'`, `'Team Leader'`). New values: `'Integrator'`, `'BGT'`, `'CSC'`, `'CET'` |
| 2 | Multiple roles per user | **Supported via `user_roles` junction table.** `users.unicorn_role` stays as the primary role for backward compatibility. Dave = primary Team Leader + additional BGT. |
| 3 | Sam Holtham role | CSC |
| 4 | Beverly Pastor-Ambo role | BGT |
| 5 | CET members | Nobody assigned for now — role definition implemented, leave unassigned |
| 6 | `is_vivacity_internal` | Already `true` for all 14 staff. Column is a boolean double-check in RLS helpers. Not a blocker. |
| 7 | Role registry | `dd_unicorn_roles` already exists from the May 2026 enum-to-dd migration. Adding a new role = INSERT a row. No ALTER TYPE, no code deployment. `role_permissions.role` will FK to this table. |
| 8 | Dynamic role validation in edge functions | `update-role-permission` queries `dd_unicorn_roles WHERE is_active = true` instead of hardcoded array. New roles are immediately accepted once added to the table. |

---

## Reference: `dd_unicorn_roles` — current + new rows

This table is the single source of truth for valid role values. `users.unicorn_role` FKs to `dd_unicorn_roles(value)`.

| `value` | `label` | `is_internal` | `sort_order` | Action |
|---|---|---|---|---|
| `Super Admin` | Super Admin | true | 1 | Keep |
| `Team Leader` | Team Leader | true | 2 | Keep |
| `Integrator` | Integrator | true | 3 | **Add in Phase 1.3** |
| `BGT` | Business Growth Team | true | 4 | **Add in Phase 1.3** |
| `CSC` | Client Success Champion | true | 5 | **Add in Phase 1.3** |
| `CET` | Client Experience Team | true | 6 | **Add in Phase 1.3** |
| `Team Member` | Team Member | true | 7 | Keep (transitional — retire after Phase 4) |
| `Admin` | Admin | false | 8 | Keep |
| `User` | User | false | 9 | Keep |
| `Academy User` | Academy User | false | 10 | Keep |

---

## Reference: Permission matrix (RBAC v5)

**Legend:** ● Full | ◐ Limited | ★ Owner only | ○ None

| Feature key | SA | TL | INT | BGT | CSC | CET |
|---|---|---|---|---|---|---|
| **ADMINISTRATION** | | | | | | |
| `admin.team_users.manage` | ● | ○ | ○ | ○ | ○ | ○ |
| `admin.tenant_users.manage` | ● | ○ | ○ | ○ | ○ | ○ |
| `admin.invites.manage` | ● | ○ | ○ | ○ | ○ | ○ |
| `admin.cohort.send` | ● | ○ | ○ | ○ | ○ | ○ |
| `admin.audit_log.view` | ● | ○ | ○ | ○ | ○ | ○ |
| `admin.email_templates.manage` | ● | ○ | ○ | ○ | ○ | ○ |
| `admin.system_config.manage` | ● | ○ | ○ | ○ | ○ | ○ |
| `admin.academy_mgmt.manage` | ● | ○ | ○ | ○ | ○ | ○ |
| **USER MANAGEMENT** | | | | | | |
| `clients.profile.view` | ● | ● | ● | ● | ● | ● |
| `clients.login_history.view` | ● | ● | ● | ● | ● | ● |
| `clients.details.edit` | ● | ● | ○ | ◐ | ◐ | ○ |
| `clients.activate` | ● | ○ | ○ | ○ | ○ | ○ |
| `clients.create` | ● | ○ | ○ | ○ | ○ | ○ |
| `clients.deactivate` | ● | ○ | ○ | ○ | ○ | ○ |
| **PACKAGES** | | | | | | |
| `packages.view` | ● | ● | ● | ● | ● | ● |
| `packages.items.tick` | ● | ● | ● | ● | ● | ● |
| `packages.notes.add` | ● | ● | ● | ● | ● | ● |
| `packages.create` | ● | ○ | ○ | ○ | ○ | ○ |
| `packages.close` | ● | ○ | ○ | ○ | ○ | ○ |
| **EOS** | | | | | | |
| `eos.overview.view` | ● | ● | ● | ● | ● | ● |
| `eos.leadership_dashboard.view` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.scorecard.view` | ● | ● | ● | ● | ● | ● |
| `eos.scorecard.update_own` | ● | ● | ★ | ★ | ★ | ★ |
| `eos.scorecard.manage` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.mission_control.view` | ● | ● | ● | ● | ● | ● |
| `eos.mission_control.edit` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.flight_plan.view` | ● | ● | ● | ● | ● | ● |
| `eos.flight_plan.edit` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.rocks.company.create` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.rocks.view` | ● | ● | ● | ● | ● | ● |
| `eos.rocks.own.manage` | ● | ● | ● | ● | ● | ● |
| `eos.todos.own` | ● | ● | ● | ● | ● | ● |
| `eos.todos.others` | ● | ● | ● | ○ | ○ | ○ |
| `eos.meetings.l10.participate` | ● | ● | ● | ● | ● | ● |
| `eos.meetings.l10.create` | ● | ● | ● | ○ | ○ | ○ |
| `eos.meetings.samepage` | ● | ● | ● | ○ | ○ | ○ |
| `eos.meetings.quarterly` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.qc.create` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.qc.own` | ● | ● | ★ | ★ | ★ | ★ |
| `eos.qc.all` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.gwc_trends.view` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.rock_analysis.view` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.client_impact.view` | ● | ● | ○ | ○ | ○ | ○ |
| `eos.processes.view` | ● | ● | ● | ● | ● | ● |
| `eos.processes.create` | ● | ● | ● | ○ | ○ | ○ |
| `eos.processes.publish` | ● | ● | ○ | ○ | ○ | ○ |
| **ACADEMY** | | | | | | |
| `academy.tenant_access.manage` | ● | ● | ○ | ○ | ○ | ○ |
| `academy.enrolments.view` | ● | ● | ● | ● | ● | ● |
| `academy.enrolments.create` | ● | ● | ○ | ● | ● | ○ |
| `academy.enrolments.revoke` | ● | ● | ○ | ○ | ○ | ○ |
| `academy.certificates.view` | ● | ● | ● | ● | ● | ● |
| `academy.certificates.issue` | ● | ● | ○ | ○ | ○ | ○ |
| `academy.builder.view` | ● | ● | ● | ● | ● | ● |
| `academy.builder.edit` | ● | ● | ○ | ● | ○ | ○ |
| `academy.builder.publish` | ● | ● | ○ | ○ | ○ | ○ |
| `academy.mapping.view` | ● | ● | ● | ○ | ○ | ○ |
| `academy.mapping.edit` | ● | ● | ○ | ○ | ○ | ○ |
| **AUDITS** | | | | | | |
| `audits.setup` | ● | ● | ○ | ○ | ● | ○ |
| `audits.operate` | ● | ● | ○ | ○ | ○ | ○ |
| `audits.view` | ● | ● | ● | ● | ● | ● |
| `audits.report` | ● | ● | ○ | ○ | ○ | ○ |
| **RESOURCE HUB** | | | | | | |
| `resource_hub.view` | ● | ● | ● | ● | ● | ● |
| `resource_hub.upload` | ● | ● | ● | ● | ● | ○ |
| `resource_hub.approve` | ● | ● | ○ | ○ | ○ | ○ |
| `resource_hub.archive` | ● | ● | ○ | ○ | ○ | ○ |

*Permission level mapping for seed: ● = `full`, ◐ = `limited`, ★ = `owner_only`, ○ = `none`*

---

## Staff role assignments (apply in Phase 4)

| Name | Email | Current | Primary Role | Additional Role |
|---|---|---|---|---|
| Angela Connell-Richards | angela@vivacity.com.au | Super Admin | **Super Admin** (keep) | — | Angela is functionally TL but holds SA — SA supersedes TL permissions |
| Dave Richards | dave@vivacity.com.au | Super Admin | **Super Admin** (keep) | — | Same as Angela — SA kept, TL role unassigned |
| Nova Canto | nova@vivacity.com.au | Super Admin | **Integrator** | — |
| Sharwari Rajurkar | Sharwari@vivacity.com.au | Super Admin | **CSC** | — |
| Kelly Xu | kelly@vivacity.com.au | Super Admin | **CSC** | — |
| Tanya Janklin | tanya@vivacity.com.au | Super Admin | **CSC** | — |
| AJ Delostrico | AJ@vivacity.com.au | Super Admin | **CSC** | — |
| Ezel Olores | ezel@vivacity.com.au | Super Admin | **CSC** | — |
| Samantha Holtham | sam@vivacity.com.au | Super Admin | **CSC** | — |
| Beverly Pastor-Ambo | beverly@vivacity.com.au | Super Admin | **BGT** | — |
| Carl Simpao | carl@vivacity.com.au | Super Admin | **Super Admin** (keep) | — |
| Khian Sismundo | brian@vivacity.com.au | Super Admin | **Super Admin** (keep) | — |
| RJ Badua | Rhald@vivacity.com.au | Super Admin | **Super Admin** (keep) | — |
| CET | — | — | Nobody assigned yet | — |

---

## Phase tracking

| Phase | Name | Prompts | Status | Depends on |
|---|---|---|---|---|
| 0 | Security patches | 1 | ✅ Done | Nothing |
| 1 | DB foundation | 5 | ✅ Done | Nothing |
| 2 | Edge function updates | 2 | ✅ Done | Phase 1 deployed |
| 3 | `useRBAC.tsx` update | 1 | ✅ Done | Phase 1 deployed |
| 4 | Staff reassignments | SQL only | ✅ Done | Phases 2 + 3 deployed |
| 4.1 | Hotfix — stale frontend role lists (TenantTypeContext etc.) | Hotfix | ✅ Done | Phase 4 deployed |
| 4.2 | `vivacityRoles.ts` — centralise frontend role list | 1 | ✅ Done | Phase 4.1 done |
| 4.3 | DB function migration — stale `is_vivacity_*` helpers | 1 | ✅ Done | Phase 1 deployed |
| 5 | Academy gates + bug fixes | 7 | ✅ Done | Phase 3 deployed |
| 6 | Permission edge function | 1 | ✅ Done | Phase 4.3 deployed |
| 7 | Permission editor UI | 1 | ✅ Done | Phase 6 deployed |
| 8 | `usePermission` hook + wiring | 5 | ✅ Done | Phase 7 + seed verified |

---

## Phase 0 — Security patches

**Run immediately. No dependencies.**

> ⚠️ **Note:** The changes in Prompt 0.1 are a temporary hardening. Phase 2.2 supersedes them by replacing the entire permission check with `check_permission`. If Phase 2 deploys soon after Phase 0, the Phase 0 changes will be overwritten — that is expected and fine.

Two live gaps where Client Admins (`unicorn_role = 'Admin'`, `user_type = 'Client Parent'`) can call internal-only functions because `user_type` is not checked alongside `unicorn_role`.

### Prompt 0.1 — Fix edge function auth gaps

> **Files:** `supabase/functions/generate-release-documents/index.ts`, `supabase/functions/export-compliance-pack/index.ts`
>
> Both functions check `unicorn_role in ['Super Admin', 'Admin']` but do not check `user_type`. A Client Admin (`unicorn_role = 'Admin'`, `user_type = 'Client Parent'`) can currently call these two functions. Fix both:
>
> Add a `user_type` check immediately after the role check. Only permit the call if `user_type IN ('Vivacity', 'Vivacity Team')`. If user_type does not match, return HTTP 403 `{ ok: false, code: 'FORBIDDEN', detail: 'Vivacity staff only' }`.
>
> Model the fix on `send-password-reset` which correctly checks both `unicorn_role` AND `user_type` before proceeding. No other changes to either file.

---

## Phase 1 — DB foundation

**Full production DB change protocol applies. Run all 5 sub-prompts in sequence with plan mode ON for each.**

### Sub-prompt 1.1 — Audit (plan mode ON, read-only)

> Conduct a read-only audit and produce a written findings report. No code. Cover:
>
> 1. `public.dd_unicorn_roles` — full table DDL and current rows
> 2. `public.users.unicorn_role` column — type, FK constraint name, all tables and functions that reference it
> 3. RLS helper functions — exact DDL for: `is_vivacity_team_safe`, `is_super_admin_safe`, `is_any_team_member` (if it exists)
> 4. `public.users` columns: `is_vivacity_internal`, `user_type` — nullability and whether all Vivacity staff have values set
> 5. Any FK constraints that would need cascading when `dd_unicorn_roles` gains new rows
> 6. Whether any existing `role_permissions`, `permission_features`, or `user_roles` tables already exist
>
> Finish with: a proposed implementation plan in numbered steps, a risk assessment, and any design decisions required before proceeding.

**Review audit output before continuing to sub-prompt 1.2.**

### Sub-prompt 1.2 — Implementation plan (plan mode ON)

> Using the audit findings, produce the complete migration plan covering all three migrations below (A, B, C). Note: Phase A adds new role rows to `dd_unicorn_roles` (no enum changes — the enum was archived May 2026 and `users.unicorn_role` is now a text FK). For each migration include: lock impact, rollback SQL, and verification queries.

### Sub-prompt 1.3 — Migration A: Seed new roles into `dd_unicorn_roles` (plan mode ON)

> The `unicorn_role` PostgreSQL enum was archived in May 2026. `public.users.unicorn_role` is now `text NOT NULL` with a FK to `public.dd_unicorn_roles(value)`. Adding new roles requires only inserting rows — no `ALTER TYPE` needed.
>
> ⚠️ **Critical pre-check:** A migration in the codebase (around `20260518224543_`) contains a hardcoded assertion `IF v_canonical <> 6 THEN RAISE EXCEPTION` on `dd_unicorn_roles`. Adding 4 new rows takes the count to 10. Before running this migration, find that assertion and update it to `<> 10` in the same migration file — otherwise the deployment aborts.
>
> **Step 1 — Add `is_internal` column:**
> ```sql
> ALTER TABLE public.dd_unicorn_roles
>   ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
>
> -- Backfill existing rows
> UPDATE public.dd_unicorn_roles SET is_internal = true
>   WHERE value IN ('Super Admin', 'Team Leader', 'Team Member');
> UPDATE public.dd_unicorn_roles SET is_internal = false
>   WHERE value IN ('Admin', 'User', 'Academy User');
> ```
>
> **Step 2 — Insert the four new internal roles:**
> ```sql
> INSERT INTO public.dd_unicorn_roles
>   (label, value, description, is_active, is_internal, sort_order)
> VALUES
>   ('Integrator',               'Integrator', 'Integrator seat — EOS operations, process management, and meeting facilitation', true, true, 3),
>   ('BGT',                      'BGT',        'Business Growth Team — sales, pipeline, and package delivery', true, true, 4),
>   ('Client Success Champion',  'CSC',        'Client Success Champion — primary client delivery team, daily package delivery and audit setup', true, true, 5),
>   ('Client Experience Team',   'CET',        'Client relationship and experience — notes, actions, documents, timeline', true, true, 6)
> ON CONFLICT (value) DO NOTHING;
>
> -- Reorder existing rows to fit the new sort_order scheme
> UPDATE public.dd_unicorn_roles SET sort_order = 7 WHERE value = 'Team Member';
> UPDATE public.dd_unicorn_roles SET sort_order = 8 WHERE value = 'Admin';
> UPDATE public.dd_unicorn_roles SET sort_order = 9 WHERE value = 'User';
> UPDATE public.dd_unicorn_roles SET sort_order = 10 WHERE value = 'Academy User';
> ```
>
> **Verification:**
> ```sql
> SELECT value, label, is_internal, sort_order
> FROM public.dd_unicorn_roles
> ORDER BY sort_order;
> -- Expect 10 rows. Rows 3-6 should be Integrator, BGT, CSC, CET with is_internal = true.
> ```

### Sub-prompt 1.4 — Migration B: Permission tables and `user_roles` junction table (plan mode ON)

> ⚠️ **Ordering dependency:** The RLS policies below reference `public.is_vivacity_team_safe` and `public.is_super_admin_safe`. These functions already exist in the production DB but only know about the old 3-role model. They work for this migration because no staff hold new roles yet. Phase 1.5 then updates them to include new roles. If deploying to a fresh environment, run Phase 1.5 steps 1–5 (helper functions only, not `check_permission`) before this migration.
>
> Create four objects in a single migration: the `permission_level` enum, three permission tables (`permission_features`, `role_permissions`, `permission_change_log`), and the `user_roles` junction table. Apply RLS to all tables.
>
> **Step 1 — Permission level enum:**
> ```sql
> CREATE TYPE public.permission_level AS ENUM (
>   'full',
>   'limited',
>   'owner_only',
>   'none'
> );
> ```
>
> **Step 2 — Permission tables:**
> ```sql
> CREATE TABLE public.permission_features (
>   id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
>   feature_key text        NOT NULL UNIQUE,
>   label       text        NOT NULL,
>   module      text        NOT NULL,
>   category    text        NOT NULL,
>   description text,
>   sort_order  integer     NOT NULL DEFAULT 0,
>   is_active   boolean     NOT NULL DEFAULT true,
>   created_at  timestamptz NOT NULL DEFAULT now()
> );
>
> CREATE TABLE public.role_permissions (
>   id          uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
>   feature_key text                    NOT NULL REFERENCES public.permission_features(feature_key) ON DELETE CASCADE,
>   role        text                    NOT NULL REFERENCES public.dd_unicorn_roles(value) ON DELETE RESTRICT,
>   permission  public.permission_level NOT NULL DEFAULT 'none',
>   notes       text,
>   updated_by  uuid                    REFERENCES public.users(user_uuid),
>   updated_at  timestamptz             NOT NULL DEFAULT now(),
>   UNIQUE (feature_key, role)
> );
>
> CREATE TABLE public.permission_change_log (
>   id             bigserial               PRIMARY KEY,
>   feature_key    text                    NOT NULL,
>   role           text                    NOT NULL,
>   old_permission public.permission_level,
>   new_permission public.permission_level NOT NULL,
>   changed_by     uuid                    NOT NULL REFERENCES public.users(user_uuid),
>   changed_at     timestamptz             NOT NULL DEFAULT now(),
>   reason         text
> );
>
> CREATE INDEX ON public.role_permissions (feature_key);
> CREATE INDEX ON public.role_permissions (role);
> CREATE INDEX ON public.permission_change_log (changed_at DESC);
> CREATE INDEX ON public.permission_change_log (feature_key);
> ```
>
> **Step 3 — `user_roles` junction table (multi-role support):**
> ```sql
> CREATE TABLE public.user_roles (
>   id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
>   user_id     uuid        NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
>   role        text        NOT NULL REFERENCES public.dd_unicorn_roles(value) ON DELETE RESTRICT,
>   is_primary  boolean     NOT NULL DEFAULT false,
>   assigned_by uuid        REFERENCES public.users(user_uuid),
>   assigned_at timestamptz NOT NULL DEFAULT now(),
>   UNIQUE (user_id, role)
> );
>
> CREATE INDEX ON public.user_roles (user_id);
> CREATE INDEX ON public.user_roles (role);
> ```
>
> **Step 4 — RLS policies:**
> ```sql
> -- permission_features: all authenticated internal staff can read
> ALTER TABLE public.permission_features ENABLE ROW LEVEL SECURITY;
> CREATE POLICY "pf_read_for_staff" ON public.permission_features
>   FOR SELECT TO authenticated
>   USING (public.is_vivacity_team_safe(auth.uid()));
>
> -- role_permissions: all authenticated internal staff can read; no direct write
> ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
> CREATE POLICY "rp_read_for_staff" ON public.role_permissions
>   FOR SELECT TO authenticated
>   USING (public.is_vivacity_team_safe(auth.uid()));
>
> -- permission_change_log: Super Admin only
> ALTER TABLE public.permission_change_log ENABLE ROW LEVEL SECURITY;
> CREATE POLICY "pcl_read_for_sa" ON public.permission_change_log
>   FOR SELECT TO authenticated
>   USING (public.is_super_admin_safe(auth.uid()));
>
> -- user_roles: internal staff read; write via edge function only
> ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
> CREATE POLICY "ur_read_for_staff" ON public.user_roles
>   FOR SELECT TO authenticated
>   USING (public.is_vivacity_team_safe(auth.uid()));
> ```
>
> **Step 5 — Seed `permission_features` (64 rows):**
> ```sql
> INSERT INTO public.permission_features (feature_key, label, module, category, sort_order) VALUES
> -- Administration
> ('admin.team_users.manage',      'Team user management',           'Administration', 'Administration', 10),
> ('admin.tenant_users.manage',    'Tenant user management',         'Administration', 'Administration', 20),
> ('admin.invites.manage',         'Manage invites',                 'Administration', 'Administration', 30),
> ('admin.cohort.send',            'Cohort sender',                  'Administration', 'Administration', 40),
> ('admin.audit_log.view',         'System audit logs',              'Administration', 'Administration', 50),
> ('admin.email_templates.manage', 'Email templates (system)',       'Administration', 'Administration', 60),
> ('admin.system_config.manage',   'System / kit config',            'Administration', 'Administration', 70),
> ('admin.academy_mgmt.manage',    'Academy management console',     'Administration', 'Administration', 80),
> -- Clients
> ('clients.profile.view',         'View client profile & timeline', 'Clients', 'Client Management', 100),
> ('clients.login_history.view',   'View client login history',      'Clients', 'Client Management', 110),
> ('clients.details.edit',         'Edit client details',            'Clients', 'Client Management', 120),
> ('clients.activate',             'Activate a client',              'Clients', 'Client Management', 130),
> ('clients.create',               'Create / set up client',         'Clients', 'Client Management', 140),
> ('clients.deactivate',           'Deactivate / close client',      'Clients', 'Client Management', 150),
> -- Packages
> ('packages.view',                'View package & progress',        'Packages', 'Packages', 200),
> ('packages.items.tick',          'Tick off package items',         'Packages', 'Packages', 210),
> ('packages.notes.add',           'Add notes / log time / share',   'Packages', 'Packages', 220),
> ('packages.create',              'Create / start a package',       'Packages', 'Packages', 230),
> ('packages.close',               'Close a package',                'Packages', 'Packages', 240),
> -- EOS
> ('eos.overview.view',            'EOS Overview — view',            'EOS', 'EOS — Overview', 300),
> ('eos.leadership_dashboard.view','Leadership Dashboard',           'EOS', 'EOS — Dashboard', 310),
> ('eos.scorecard.view',           'Scorecard — view',               'EOS', 'EOS — Scorecard', 320),
> ('eos.scorecard.update_own',     'Scorecard — update own metric',  'EOS', 'EOS — Scorecard', 330),
> ('eos.scorecard.manage',         'Scorecard — configure',          'EOS', 'EOS — Scorecard', 340),
> ('eos.mission_control.view',     'Mission Control — view',         'EOS', 'EOS — Mission Control', 350),
> ('eos.mission_control.edit',     'Mission Control — edit',         'EOS', 'EOS — Mission Control', 360),
> ('eos.flight_plan.view',         'Flight Plan — view',             'EOS', 'EOS — Flight Plan', 370),
> ('eos.flight_plan.edit',         'Flight Plan — edit',             'EOS', 'EOS — Flight Plan', 380),
> ('eos.rocks.company.create',     'Company Rock — create/edit',     'EOS', 'EOS — Rocks', 390),
> ('eos.rocks.view',               'Company Rock — view',            'EOS', 'EOS — Rocks', 400),
> ('eos.rocks.own.manage',         'Rock — tasks on own Rock',       'EOS', 'EOS — Rocks', 410),
> ('eos.todos.own',                'Add To-Do for yourself',         'EOS', 'EOS — To-Dos', 420),
> ('eos.todos.others',             'Add To-Do for others',           'EOS', 'EOS — To-Dos', 430),
> ('eos.meetings.l10.participate', 'L10 — participate',              'EOS', 'EOS — Meetings', 440),
> ('eos.meetings.l10.create',      'L10 — create / configure',       'EOS', 'EOS — Meetings', 450),
> ('eos.meetings.samepage',        'Same Page Meeting',              'EOS', 'EOS — Meetings', 460),
> ('eos.meetings.quarterly',       'Quarterly / Annual — create',    'EOS', 'EOS — Meetings', 470),
> ('eos.qc.create',                'Create QC (schedule)',           'EOS', 'EOS — Quarterly Conversations', 480),
> ('eos.qc.own',                   'View & submit own QC',           'EOS', 'EOS — Quarterly Conversations', 490),
> ('eos.qc.all',                   'View all QCs (manager)',          'EOS', 'EOS — Quarterly Conversations', 500),
> ('eos.gwc_trends.view',          'GWC Trends',                     'EOS', 'EOS — Analytics', 510),
> ('eos.rock_analysis.view',       'Rock Success Analysis',          'EOS', 'EOS — Analytics', 520),
> ('eos.client_impact.view',       'Client Impact Reporting',        'EOS', 'EOS — Analytics', 530),
> ('eos.processes.view',           'View processes',                 'EOS', 'EOS — Processes', 540),
> ('eos.processes.create',         'Create / edit process',          'EOS', 'EOS — Processes', 550),
> ('eos.processes.publish',        'Approve / publish process',      'EOS', 'EOS — Processes', 560),
> -- Academy
> ('academy.tenant_access.manage', 'Manage tenant access',           'Academy', 'Academy — Tenant Access', 600),
> ('academy.enrolments.view',      'View all enrolments',            'Academy', 'Academy — Enrolments', 610),
> ('academy.enrolments.create',    'Enrol a client in training',     'Academy', 'Academy — Enrolments', 620),
> ('academy.enrolments.revoke',    'Revoke / expire enrolment',      'Academy', 'Academy — Enrolments', 630),
> ('academy.certificates.view',    'View all certificates',          'Academy', 'Academy — Certificates', 640),
> ('academy.certificates.issue',   'Issue / revoke certificate',     'Academy', 'Academy — Certificates', 650),
> ('academy.builder.view',         'View course library',            'Academy', 'Academy — Builder', 660),
> ('academy.builder.edit',         'Create / edit courses',          'Academy', 'Academy — Builder', 670),
> ('academy.builder.publish',      'Publish / unpublish course',     'Academy', 'Academy — Builder', 680),
> ('academy.mapping.view',         'View mapping matrix',            'Academy', 'Academy — Mapping', 690),
> ('academy.mapping.edit',         'Create / edit mapping rules',    'Academy', 'Academy — Mapping', 700),
> -- Audits
> ('audits.setup',                 'Set up / create an audit',       'Audits', 'Audits', 900),
> ('audits.operate',               'Operate / run the audit',        'Audits', 'Audits', 910),
> ('audits.view',                  'View audit results',             'Audits', 'Audits', 920),
> ('audits.report',                'Generate & release report',      'Audits', 'Audits', 930),
> -- Resource Hub
> ('resource_hub.view',            'View / browse resources',        'Resource Hub', 'Resource Hub', 800),
> ('resource_hub.upload',          'Upload / create resource',       'Resource Hub', 'Resource Hub', 810),
> ('resource_hub.approve',         'Approve & publish resource',     'Resource Hub', 'Resource Hub', 820),
> ('resource_hub.archive',         'Archive / remove resource',      'Resource Hub', 'Resource Hub', 830)
> ON CONFLICT (feature_key) DO NOTHING;
> ```
>
> **Step 6 — Seed `role_permissions`:**
>
> Using the permission matrix in the Reference section above, insert one row per (feature_key, role) combination — 64 features × 6 roles = 384 rows. Convert the legend as: ● → `full`, ◐ → `limited`, ★ → `owner_only`, ○ → `none`. SA is always `full` on every feature. Pattern:
>
> ```sql
> INSERT INTO public.role_permissions (feature_key, role, permission) VALUES
> -- admin.team_users.manage
> ('admin.team_users.manage', 'Super Admin', 'full'),
> ('admin.team_users.manage', 'Team Leader', 'none'),
> ('admin.team_users.manage', 'Integrator',  'none'),
> ('admin.team_users.manage', 'BGT',         'none'),
> ('admin.team_users.manage', 'CSC',         'none'),
> ('admin.team_users.manage', 'CET',         'none'),
> -- ... continue for all 64 features following the matrix ...
> ON CONFLICT (feature_key, role) DO UPDATE SET permission = EXCLUDED.permission;
> ```
>
> **Verification:**
> ```sql
> SELECT COUNT(*) FROM permission_features;        -- expect 64
> SELECT COUNT(*) FROM role_permissions;           -- expect 384 (64 × 6)
> SELECT COUNT(*) FROM role_permissions
>   WHERE permission != 'none'
>   AND role = 'CSC';                              -- spot-check CSC has non-none permissions
> SELECT COUNT(*) FROM user_roles;                 -- expect 0 (populated in Phase 4)
> ```

### Sub-prompt 1.5 — Migration C: RLS helper functions (plan mode ON)

> ⚠️ **Note:** `is_vivacity_team_safe` and `is_super_admin_safe` already exist in the production DB but are not in any migration file — they were likely created manually. Use `CREATE OR REPLACE FUNCTION` (already specified below) which handles both cases: updates if they exist, creates if they don't.
>
> Create or replace the RLS helper functions listed below. Every function must follow these conventions:
> - `SET search_path = ''` (empty string, not `'public'`)
> - All object references fully schema-qualified (e.g. `public.users`, `auth.uid()`)
> - `LANGUAGE sql STABLE SECURITY DEFINER`
> - `REVOKE ALL ON FUNCTION ... FROM PUBLIC` after creating
> - `GRANT EXECUTE ON FUNCTION ... TO authenticated`
>
> ```sql
> -- All 6 internal roles
> CREATE OR REPLACE FUNCTION public.is_vivacity_team_safe(p_user_id uuid)
> RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
> SET search_path = '' AS $$
>   SELECT EXISTS (
>     SELECT 1 FROM public.users u
>     WHERE u.user_uuid = p_user_id
>       AND u.unicorn_role IN ('Super Admin','Team Leader','Integrator','BGT','CSC','CET')
>       AND u.is_vivacity_internal = true
>       AND (u.disabled = false OR u.disabled IS NULL)
>   );
> $$;
>
> -- Super Admin only
> CREATE OR REPLACE FUNCTION public.is_super_admin_safe(p_user_id uuid)
> RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
> SET search_path = '' AS $$
>   SELECT EXISTS (
>     SELECT 1 FROM public.users u
>     WHERE u.user_uuid = p_user_id
>       AND u.unicorn_role = 'Super Admin'
>       AND u.is_vivacity_internal = true
>       AND (u.disabled = false OR u.disabled IS NULL)
>   );
> $$;
>
> -- Team Leader + SA
> CREATE OR REPLACE FUNCTION public.is_team_leader_or_above(p_user_id uuid)
> RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
> SET search_path = '' AS $$
>   SELECT EXISTS (
>     SELECT 1 FROM public.users u
>     WHERE u.user_uuid = p_user_id
>       AND u.unicorn_role IN ('Super Admin','Team Leader')
>       AND u.is_vivacity_internal = true
>       AND (u.disabled = false OR u.disabled IS NULL)
>   );
> $$;
>
> -- Integrator + TL + SA
> CREATE OR REPLACE FUNCTION public.is_integrator_or_above(p_user_id uuid)
> RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
> SET search_path = '' AS $$
>   SELECT EXISTS (
>     SELECT 1 FROM public.users u
>     WHERE u.user_uuid = p_user_id
>       AND u.unicorn_role IN ('Super Admin','Team Leader','Integrator')
>       AND u.is_vivacity_internal = true
>       AND (u.disabled = false OR u.disabled IS NULL)
>   );
> $$;
>
> -- Any internal staff member (same as is_vivacity_team_safe — alias for clarity)
> CREATE OR REPLACE FUNCTION public.is_any_team_member(p_user_id uuid)
> RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
> SET search_path = '' AS $$
>   SELECT public.is_vivacity_team_safe(p_user_id);
> $$;
> ```
>
> After creating each function:
> ```sql
> REVOKE ALL ON FUNCTION public.is_vivacity_team_safe(uuid) FROM PUBLIC;
> GRANT EXECUTE ON FUNCTION public.is_vivacity_team_safe(uuid) TO authenticated;
> -- repeat for each function
> ```
>
> **Verification:** Call each function with a known Super Admin UUID — expect `true`. Call with a known client user UUID — expect `false`.

**Step 2 — Add `check_permission` — the single gate used by all three layers:**

```sql
CREATE OR REPLACE FUNCTION public.check_permission(
  p_user_id     uuid,
  p_feature_key text,
  p_min_level   text DEFAULT 'full'
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT CASE
    -- Super Admin always has full access regardless of role_permissions
    WHEN EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = p_user_id
        AND u.unicorn_role = 'Super Admin'
        AND u.is_vivacity_internal = true
        AND (u.disabled = false OR u.disabled IS NULL)
    ) THEN true

    -- Check primary role + any additional roles from user_roles
    ELSE EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      WHERE rp.feature_key = p_feature_key
        AND rp.role IN (
          SELECT u2.unicorn_role
          FROM public.users u2
          WHERE u2.user_uuid = p_user_id
          UNION
          SELECT ur.role
          FROM public.user_roles ur
          WHERE ur.user_id = p_user_id
        )
        AND CASE rp.permission
              WHEN 'full'       THEN 4
              WHEN 'limited'    THEN 3
              WHEN 'owner_only' THEN 2
              WHEN 'none'       THEN 1
              ELSE 0
            END
            >=
            CASE p_min_level
              WHEN 'full'       THEN 4
              WHEN 'limited'    THEN 3
              WHEN 'owner_only' THEN 2
              WHEN 'none'       THEN 1
              ELSE 0
            END
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.check_permission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_permission(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_permission(uuid, text, text) TO service_role;
```

> This is the single function called by edge functions, RLS policies, and (via the client) the `usePermission` hook. If no `role_permissions` row exists for a (feature_key, role) pair, the function returns `false` — safe default, surfaces as a gap in the editor.
>
> ⚠️ **`owner_only` is a UI-layer concept only.** The function compares levels numerically: `full`=4, `limited`=3, `owner_only`=2, `none`=1. An edge function calling with `p_min_level = 'limited'` will correctly return `false` for a user whose permission is `owner_only` — because `owner_only` means "only your own data" which requires resource context the function doesn't have. **Edge functions must only ever call `check_permission` with `'full'` or `'limited'` as `p_min_level`.** Never use `'owner_only'` in an edge function call — it's a UI display value only.
>
> **Verification:**
> ```sql
> -- SA user should get true for any feature
> SELECT public.check_permission('<sa-uuid>', 'admin.team_users.manage', 'full');
> -- CSC user should get false for admin feature
> SELECT public.check_permission('<csc-uuid>', 'admin.team_users.manage', 'full');
> -- CSC user should get true for packages feature
> SELECT public.check_permission('<csc-uuid>', 'packages.notes.add', 'full');
> ```

---

## Phase 2 — Edge function updates

**Must deploy before Phase 4 staff reassignments. No DB protocol needed.**

### Prompt 2.1 — Update shared helpers

> **Files:** `supabase/functions/_shared/auth-helpers.ts`, `supabase/functions/_shared/ask-viv-access.ts`
>
> In `auth-helpers.ts`:
> - Update `VIVACITY_ROLES` array to: `['Super Admin', 'Team Leader', 'Team Member', 'Integrator', 'BGT', 'CSC', 'CET']` — keep `'Team Member'` during transition
> - Update `SUPER_ADMIN_ROLE` constant to `'Super Admin'`
> - Export a named constant `VIVACITY_STAFF_ROLES` with the same value
>
> In `ask-viv-access.ts`:
> - Update `VIVACITY_INTERNAL_ROLES` to the same list
>
> No other files changed in this prompt.

### Prompt 2.2 — Replace hardcoded role checks with `check_permission`

> Replace the permission gate in each edge function below with a `check_permission` RPC call. This makes every function honour the `role_permissions` table — changing the permission editor immediately changes what the server accepts.
>
> **Pattern to apply in every function:**
> ```typescript
> // Replace this kind of hardcoded check:
> if (callerData.unicorn_role !== 'Super Admin') return jsonError(403, 'FORBIDDEN');
>
> // With this:
> const { data: allowed } = await supabase.rpc('check_permission', {
>   p_user_id: caller.id,
>   p_feature_key: 'feature.key.here',
>   p_min_level: 'full',
> });
> if (!allowed) return jsonError(403, 'FORBIDDEN');
> ```
>
> **Function → feature key mapping:**
>
> | Edge function | Feature key | Notes |
> |---|---|---|
> | `update-user-role` | `admin.team_users.manage` | Remove `global_role` fallback |
> | `bulk-user-action` | `admin.team_users.manage` | Remove `global_role` fallback |
> | `bulk-send-invitations` | `admin.invites.manage` | Remove `global_role` fallback |
> | `generate-recovery-link` | `admin.team_users.manage` | |
> | `delete-user` (Vivacity path) | `admin.team_users.manage` | Client path unchanged |
> | `toggle-user-status` (Vivacity path) | `admin.team_users.manage` | Client path unchanged |
> | `bulk-account-actions` | `admin.team_users.manage` | |
> | `activate-ghost-user` | `admin.team_users.manage` | |
> | `cohort-access-sender-worker` | `admin.cohort.send` | |
> | `invite-user` (Vivacity path) | `admin.team_users.manage` | Client/tenant path unchanged |
> | `send-password-reset` (Vivacity path) | `admin.team_users.manage` | Client path unchanged |
> | `update-user-profile` (admin path) | `admin.team_users.manage` | Self-edit path unchanged |
> | `resend-invite` (staff path) | `admin.invites.manage` | Remove `global_role` fallback |
> | `cancel-invite` (staff path) | `admin.invites.manage` | Remove `global_role` fallback |
> | `generate-release-documents` | `audits.report` | Also fixes the missing `user_type` check from Phase 0 |
> | `export-compliance-pack` | `audits.report` | Same |
>
> Every function must still verify the caller is authenticated before calling `check_permission`. The RPC handles the role logic — do not add any role string checks on top of it.
>
> **Note on `supabase` client in edge functions:** use the service-role client (bypasses RLS) to call `check_permission` since it needs to read `users`, `user_roles`, and `role_permissions`. The function itself is `SECURITY DEFINER` so this is safe.
>
> **Additional changes required in this prompt — 4 files beyond the permission gate replacements:**
>
> **A — `supabase/functions/invite-user/index.ts`:** Update the `UnicornRole` type union (lines ~5–10) and the `VIVACITY_ROLES` array (lines ~28–33) to include all new values:
> ```typescript
> type UnicornRole =
>   | "Super Admin" | "Team Leader" | "Team Member"
>   | "Integrator" | "BGT" | "CSC" | "CET"
>   | "Admin" | "User" | "Academy User";
>
> const VIVACITY_ROLES: UnicornRole[] = [
>   "Super Admin", "Team Leader", "Team Member",
>   "Integrator", "BGT", "CSC", "CET",
> ];
> ```
>
> **B — `supabase/functions/update-user-role/index.ts`:** Update the `UpdateUserRoleRequest` interface `unicorn_role` field to accept all roles. Also add the missing `Team Leader` case and new role cases to the `superadmin_level` auto-derive block:
> ```typescript
> interface UpdateUserRoleRequest {
>   unicorn_role?: 'Super Admin' | 'Team Leader' | 'Team Member'
>     | 'Integrator' | 'BGT' | 'CSC' | 'CET'
>     | 'Admin' | 'User' | 'Academy User';
>   // ... rest unchanged
> }
>
> // Auto-derive superadmin_level update:
> if (unicorn_role === 'Super Admin' && user_type === 'Vivacity') {
>   updates.superadmin_level = 'Administrator';
> } else if (unicorn_role === 'Super Admin' && user_type === 'Vivacity Team') {
>   updates.superadmin_level = 'Administrator';
> } else if (unicorn_role === 'Team Leader') {
>   updates.superadmin_level = 'Team Leader';
> } else {
>   // Integrator, BGT, CSC, CET, Team Member, Admin, User — no superadmin_level
>   updates.superadmin_level = null;
> }
> ```
>
> **C — `supabase/functions/send-invitation-email/index.ts`:** Add the 4 missing entries to `ROLE_LABELS`:
> ```typescript
> const ROLE_LABELS: Record<string, string> = {
>   "Super Admin": "Super Admin",
>   "Team Leader": "Team Leader",
>   "Team Member": "Team Member",
>   "Integrator": "Integrator",
>   "BGT": "Business Growth Team",
>   "CSC": "Client Success Champion",
>   "CET": "Client Experience Team",
>   Admin: "Organisation Admin",
>   User: "General User",
>   "Academy User": "Academy User",
> };
> ```

---

## Phase 3 — `useRBAC.tsx` update

### Prompt 3.1 — Add new roles to RBAC hook

> **File:** `src/hooks/useRBAC.tsx`
>
> Add four new entries to the `ROLE_PERMISSIONS` map. Also update the `is_vivacity_team` detection. Keep all existing entries — do not remove `'Team Member'`.
>
> New permission entries:
>
> ```typescript
> 'Integrator': [
>   'advanced_features:access',
>   'eos:access',
>   'ask_viv:access',
>   'vto:edit',
>   'eos_meetings:schedule',
>   'eos_meetings:edit',
>   'qc:schedule',
>   'rocks:create',
>   'rocks:edit_own',
>   'rocks:edit_others',
>   'risks:create',
>   'risks:escalate',
>   'agenda_templates:manage',
> ],
> 'BGT': [
>   'advanced_features:access',
>   'eos:access',
>   'ask_viv:access',
>   'rocks:create',
>   'rocks:edit_own',
>   'risks:create',
> ],
> 'CSC': [
>   'advanced_features:access',
>   'eos:access',
>   'ask_viv:access',
>   'rocks:create',
>   'rocks:edit_own',
>   'risks:create',
>   'risks:escalate',
> ],
> 'CET': [
>   'eos:access',
>   'ask_viv:access',
>   'rocks:create',
>   'rocks:edit_own',
>   'risks:create',
> ],
> ```
>
> Update `is_vivacity_team` detection:
> ```typescript
> const is_vivacity_team = [
>   'Super Admin', 'Team Leader', 'Team Member',
>   'Integrator', 'BGT', 'CSC', 'CET'
> ].includes(profile?.unicorn_role || '');
> ```
>
> **Remove the `superadmin_level === 'Assistant'` special case** (around line 200):
> ```typescript
> // DELETE this entire block:
> if (profile?.superadmin_level === 'Assistant') {
>   userRole = 'Team Leader';
> }
> ```
> This was a legacy workaround. After this change, role-based permissions derive solely from `unicorn_role`. Any user with `superadmin_level = 'Assistant'` will no longer be silently promoted to Team Leader permissions.
>
> **Also update `useAuth.tsx`** — the `UserProfile` interface `unicorn_role` type union is missing the new values. Add them:
> ```typescript
> unicorn_role: 'Super Admin' | 'Team Leader' | 'Team Member'
>   | 'Integrator' | 'BGT' | 'CSC' | 'CET'
>   | 'Admin' | 'User' | 'Academy User';
> ```

---

## Phase 4 — Staff role reassignments (direct SQL, not Lovable)

**Run after Phases 1–3 are deployed and verified.** Dry-run each UPDATE with a SELECT first.

```sql
-- Dry-run check
SELECT email, unicorn_role FROM public.users
WHERE email IN (
  'nova@vivacity.com.au',
  'Sharwari@vivacity.com.au', 'kelly@vivacity.com.au', 'tanya@vivacity.com.au',
  'AJ@vivacity.com.au', 'ezel@vivacity.com.au', 'sam@vivacity.com.au',
  'beverly@vivacity.com.au'
);

-- Apply
UPDATE public.users SET unicorn_role = 'Integrator', updated_at = now()
  WHERE email = 'nova@vivacity.com.au';

UPDATE public.users SET unicorn_role = 'CSC', updated_at = now()
  WHERE email IN (
    'Sharwari@vivacity.com.au', 'kelly@vivacity.com.au', 'tanya@vivacity.com.au',
    'AJ@vivacity.com.au', 'ezel@vivacity.com.au', 'sam@vivacity.com.au'
  );

UPDATE public.users SET unicorn_role = 'BGT', updated_at = now()
  WHERE email = 'beverly@vivacity.com.au';

-- Angela (angela@vivacity.com.au), Dave (dave@vivacity.com.au),
-- Carl (carl@vivacity.com.au), Khian (brian@vivacity.com.au), RJ (Rhald@vivacity.com.au)
-- all stay as 'Super Admin' — no change needed

-- Clear superadmin_level for all reassigned staff
-- (legacy field; new role model derives permissions from unicorn_role only)
UPDATE public.users SET superadmin_level = null, updated_at = now()
WHERE email IN (
  'nova@vivacity.com.au',
  'Sharwari@vivacity.com.au', 'kelly@vivacity.com.au', 'tanya@vivacity.com.au',
  'AJ@vivacity.com.au', 'ezel@vivacity.com.au', 'sam@vivacity.com.au',
  'beverly@vivacity.com.au'
);

-- Retire 'Team Member' — set is_active = false so it disappears from the
-- permission editor column list. The test account (angela+invitetest) keeps
-- the role value for now; it will still function but won't appear in editor columns.
UPDATE public.dd_unicorn_roles SET is_active = false, updated_at = now()
WHERE value = 'Team Member';
```

**Verification:**
```sql
-- Confirm role assignments
SELECT email, unicorn_role, superadmin_level FROM public.users
WHERE email IN ('nova@vivacity.com.au', 'beverly@vivacity.com.au', 'tanya@vivacity.com.au',
  'Sharwari@vivacity.com.au', 'kelly@vivacity.com.au', 'AJ@vivacity.com.au',
  'ezel@vivacity.com.au', 'sam@vivacity.com.au');
-- All superadmin_level values should be NULL

-- Confirm Team Member is retired
SELECT value, is_active FROM public.dd_unicorn_roles WHERE value = 'Team Member';
-- Expect: is_active = false
```

---

## Phase 4.3 — DB function migration: stale `is_vivacity_*` helpers

**Depends on Phase 1. Lovable migration, full production DB protocol.**

Nine DB functions still hardcode `unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')`. They need to check `is_vivacity_internal` instead — a single boolean that `sync_is_vivacity_internal` now maintains automatically from `dd_unicorn_roles`. This makes adding future roles a zero-code-change operation at the DB layer.

> **Lovable prompt (plan mode ON first):**
>
> Create a single migration that replaces all stale Vivacity-staff helper functions. Use `CREATE OR REPLACE` throughout. Keep existing `search_path` settings on functions that already have them.
>
> **Trigger functions — already fixed manually; include to make canonical in migrations:**
>
> ```sql
> -- sync_is_vivacity_internal: derive from dd_unicorn_roles
> CREATE OR REPLACE FUNCTION public.sync_is_vivacity_internal()
> RETURNS trigger LANGUAGE plpgsql AS $$
> BEGIN
>   SELECT COALESCE(is_internal, false) INTO NEW.is_vivacity_internal
>   FROM public.dd_unicorn_roles WHERE value = NEW.unicorn_role;
>   IF NOT FOUND THEN NEW.is_vivacity_internal := false; END IF;
>   RETURN NEW;
> END; $$;
>
> -- set_user_type_from_role: derive from dd_unicorn_roles
> CREATE OR REPLACE FUNCTION public.set_user_type_from_role()
> RETURNS trigger LANGUAGE plpgsql AS $$
> DECLARE v_is_internal boolean;
> BEGIN
>   SELECT COALESCE(is_internal, false) INTO v_is_internal
>   FROM public.dd_unicorn_roles WHERE value = NEW.unicorn_role;
>   IF v_is_internal THEN NEW.user_type := 'Vivacity Team';
>   ELSIF NEW.unicorn_role = 'Admin' THEN NEW.user_type := 'Client Parent';
>   ELSIF NEW.unicorn_role IN ('User', 'Academy User') THEN NEW.user_type := 'Client Child';
>   END IF;
>   RETURN NEW;
> END; $$;
> ```
>
> **Staff-check functions — replace hardcoded role IN list with `is_vivacity_internal = true`:**
>
> For each function below, find the clause `unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')` and replace it with `is_vivacity_internal = true`. Keep everything else (archived check, auth.uid() vs p_user_id, search_path, SECURITY DEFINER) exactly as-is:
>
> - `is_vivacity`
> - `is_vivacity_member`
> - `is_vivacity_staff`
> - `is_vivacity_team` (both overloads — one takes `auth.uid()`, one takes `p_user_id`)
> - `is_vivacity_team_rls`
> - `is_vivacity_team_user`
> - `is_vivacity_team_v2`
> - `is_staff` (also check both `global_role` and `unicorn_role` branches)
> - `can_access_vivacity_meetings`
>
> **Additional functions to update:**
>
> - `fn_notify_csc_on_support_ticket` — change `unicorn_role IN ('Super Admin','Team Leader','Team Member')` to `is_vivacity_internal = true`
> - `get_vivacity_team_directory` and `get_vivacity_team_directory_staff` — same substitution
> - `create_meeting_from_template` (both overloads) — the L10 participant INSERT filters by old role list; change to `is_vivacity_internal = true AND COALESCE(archived, false) = false`
> - `enforce_level10_participants` — same substitution
> - `sync_l10_meeting_participants` — same substitution
>
> **Post-migration verification:**
> ```sql
> SELECT u.email, u.unicorn_role, u.is_vivacity_internal,
>   public.is_vivacity_team_safe(u.user_uuid) AS safe,
>   public.is_any_team_member(u.user_uuid) AS any_team
> FROM public.users u
> WHERE u.unicorn_role IN ('Integrator','BGT','CSC','CET')
>   AND (u.disabled = false OR u.disabled IS NULL);
> -- All rows must show: is_vivacity_internal=true, safe=true, any_team=true
> ```

---

## Phase 5 — Academy gates + bug fixes (7 prompts)

**Run after Phase 3 deployed. Prompts are independent of each other — can run in any order.**

### Prompt 5.1 — Certificate user name bug fix

> **Route:** `/superadmin/academy/certificates`
>
> The User column on the certificates page shows only the email address. Fix it to show full name on line 1 and email on line 2 (muted, smaller text) — matching the layout of the Enrolments page User column.
>
> Steps:
> 1. Find the certificates table query — it loads `academy_certificates` (or equivalent). Identify the `user_id` FK column.
> 2. Join to `public.users` on that FK to surface `first_name` and `last_name`.
> 3. Update the User column cell renderer to display: line 1 = `first_name + ' ' + last_name` (or email if name is empty), line 2 = email in muted smaller text.
> 4. Test against the certificate for `carl+rto-b-academy-1@complyhub.ai` — it should now show the learner's full name.

### Prompt 5.2 — Breadcrumb titles fix

> All five Academy sub-pages display `"Page"` as the final breadcrumb segment. Fix each to show the correct label:
>
> | Route | Current breadcrumb | Correct breadcrumb |
> |---|---|---|
> | `/superadmin/academy/certificates` | Superadmin > Academy > **Page** | Superadmin > Academy > **Certificates** |
> | `/superadmin/academy/enrolments` | Superadmin > Academy > **Page** | Superadmin > Academy > **Enrolments** |
> | `/superadmin/academy/tenant-access` | Superadmin > Academy > **Page** | Superadmin > Academy > **Tenant Access** |
> | `/superadmin/academy/builder` | Superadmin > Academy > **Page** | Superadmin > Academy > **Academy Builder** |
> | `/superadmin/academy/package-course` | Superadmin > Academy > **Page** | Superadmin > Academy > **Package → Course Mapping** |

### Prompt 5.3 — Tenant Access gating (Team Leader + SA only)

> **Access rule:** Team Leader and Super Admin only. All other roles must not see this page.
>
> - Hide the Tenant Access item from the Academy sub-navigation for Integrator, BGT, CSC, CET — use `useRBAC` to check `isSuperAdmin || unicorn_role === 'Team Leader'`
> - Gate the enable/disable tenant toggle: TL + SA only — hidden for all other roles
> - Gate the Edit action button per row: TL + SA only
> - Gate the Enrolments link per row: TL + SA only
> - No data model changes — UI gates only

### Prompt 5.4 — Enrolments RBAC

> - All roles can view the Enrolments page and the full enrolment list (no restriction on viewing)
> - `+ New Enrolment` button: visible to TL, BGT, CSC only — hidden for SA (can use anyway), Integrator, and CET
> - `Export CSV` button: TL + SA only — hidden for Integrator, BGT, CSC, CET
> - Revoke / expire actions on individual rows: TL + SA only — hidden for all other roles
> - Source filter chips (Manual, Auto Package, etc.): visible to all — no change

### Prompt 5.5 — Certificates RBAC

> - The Certificates page is visible to all internal roles — no nav restriction
> - `Issue Certificate Manually` button: TL + SA only — hidden for Integrator, BGT, CSC, CET
> - Three-dot Actions menu on each certificate row: TL + SA only — hidden for all other roles

### Prompt 5.6 — Academy Builder RBAC

> - All roles can view the course library
> - `+ New Course` button: TL + BGT only — hidden for Integrator, CSC, CET, SA (SA can still access the page but the button follows the rule)
> - `Backfill Video Durations` button: TL + SA only — hidden for all other roles
> - Within a course, edit controls (add/edit modules, lessons, content): TL + BGT
> - Publish / Unpublish action: TL + SA only
> - Delete / Archive course: TL + SA only

### Prompt 5.7 — Package → Course Mapping RBAC

> - Hide this page from BGT, CSC, CET navigation — they should not see it at all
> - Page accessible to TL, Integrator, and SA only
> - Integrator view is read-only: all matrix cells non-interactive, all action buttons hidden, show a "View only" indicator
> - `+ New rule` button: TL + SA only
> - `Copy mappings` button: TL + SA only
> - `Select row` / `Select column` controls: TL + SA only
> - Matrix checkboxes: clickable for TL + SA only — Integrator sees the matrix but cannot click

---

## Phase 6 — `update-role-permission` edge function

**Depends on Phase 1 (permission tables must exist).**

### Prompt 6.1 — Create `update-role-permission` edge function

> **Path:** `supabase/functions/update-role-permission/index.ts`
>
> Create a new edge function with the following behaviour:
>
> **Auth:** Caller must have `unicorn_role = 'Super Admin'` AND `is_vivacity_internal = true`. Reject all others with 403.
>
> **Input (JSON body):**
> ```typescript
> {
>   feature_key: string,   // must exist in permission_features
>   role: string,          // must exist in dd_unicorn_roles WHERE is_active = true
>   new_permission: 'full' | 'limited' | 'owner_only' | 'none',
>   reason?: string        // optional audit note
> }
> ```
>
> **Validation:**
> 1. All three required fields must be present — reject 400 `MISSING_FIELDS` if not
> 2. Validate `role` by querying `SELECT value FROM public.dd_unicorn_roles WHERE value = role AND is_active = true` — reject 400 `INVALID_ROLE` if not found (do NOT hardcode valid roles)
> 3. Validate `feature_key` by querying `permission_features WHERE feature_key = feature_key` — reject 404 `FEATURE_NOT_FOUND` if not found
> 4. Hard guard: if `role = 'Super Admin'` and `new_permission != 'full'` — reject 400 `CANNOT_RESTRICT_SUPER_ADMIN`
>
> **Write:**
> 1. Read current permission from `role_permissions` for this (feature_key, role) pair
> 2. Upsert into `role_permissions`: `{ feature_key, role, permission: new_permission, updated_by: caller.id, updated_at: now() }`
> 3. Insert into `permission_change_log`: `{ feature_key, role, old_permission, new_permission, changed_by: caller.id, reason }`
>
> **Response on success:** `{ ok: true }`
>
> **Required test cases (include in PR):**
> - SA caller sets `'Super Admin'` role to `'none'` → must reject 400 `CANNOT_RESTRICT_SUPER_ADMIN`
> - Non-SA caller → must reject 403 `FORBIDDEN`
> - Valid SA caller, invalid `feature_key` → must reject 404 `FEATURE_NOT_FOUND`
> - Valid SA caller, invalid `role` not in `dd_unicorn_roles` → must reject 400 `INVALID_ROLE`
> - Adding a new row to `dd_unicorn_roles` and then calling with that new role → must succeed without code change

---

## Phase 7 — Permission editor UI

**Depends on Phase 6 deployed.**

### Prompt 7.1 — Role Permission Editor

> **Route:** `/administration/role-permissions`
> **Access:** Super Admin only — not visible in navigation for any other role
>
> **Layout:**
>
> Full-page layout matching the Administration section style.
>
> Header: title `Role Permission Editor`, subtitle `Control which roles can access each feature. Changes take effect immediately and are logged.` Right side: `Save All Changes` button (disabled until staged edits exist) + `View Change Log` button.
>
> Module filter tabs (horizontal scrollable pills): `All | Administration | Clients | Packages | EOS | Audits | Academy | Resource Hub`
>
> Search bar: real-time filter of feature rows by label.
>
> **Role columns:**
>
> Load role columns dynamically from `SELECT value, label FROM public.dd_unicorn_roles WHERE is_internal = true AND is_active = true ORDER BY sort_order`. Do not hardcode role names. Column headers show the `label` field. If a new role is added to `dd_unicorn_roles`, it appears automatically.
>
> **Permission matrix table:**
>
> Sticky header row with one column per active internal role. Rows grouped by `category` with a full-width category header row (dark background). Each cell is a dropdown select:
>
> | DB value | Label | Chip colour |
> |---|---|---|
> | `full` | ● Full | Purple |
> | `limited` | ◐ Limited | Cyan |
> | `owner_only` | ★ Owner only | Amber |
> | `none` | ○ None | Grey |
>
> The `Super Admin` column is always read-only — display a lock icon, show `Full` as static text, no dropdown. Tooltip: `"Super Admin always has full access."`
>
> Changed cells: highlight with a subtle border/tint (pending state) until saved. Rows with unsaved changes show a small yellow dot on the left.
>
> **Save behaviour:**
>
> Changes are staged locally. On `Save All Changes`:
> 1. Call `update-role-permission` edge function once per changed cell
> 2. Show progress: `"Saving 4 of 7..."`
> 3. On complete: success toast `"N permission changes saved and logged."`
> 4. On any failure: surface which cells failed with a retry option — do not silently discard
> 5. Invalidate `role-permissions` React Query cache on success
>
> **Change Log drawer:**
>
> `View Change Log` opens a right-side drawer showing `permission_change_log` records, most recent first. Each entry displays: timestamp, changed-by name, feature label, role, old → new permission level, and reason. Filterable by date range, feature, and role.
>
> **Gaps detection:**
>
> On load, run this query and store the count:
> ```sql
> SELECT pf.feature_key, pf.label, dr.value AS role
> FROM public.permission_features pf
> CROSS JOIN public.dd_unicorn_roles dr
> WHERE dr.is_internal = true AND dr.is_active = true
> LEFT JOIN public.role_permissions rp
>   ON rp.feature_key = pf.feature_key AND rp.role = dr.value
> WHERE rp.id IS NULL;
> ```
>
> If any gaps exist:
> - Show a yellow warning banner at the top: `"⚠️ N unconfigured permissions — new features have been added without default permissions. Review and set below."`
> - In the matrix, cells with no row render with a striped amber background and a `— Unset` label instead of a dropdown
> - Clicking an unset cell opens the dropdown and saves a new row — it converts from gap to configured
> - Gaps disappear from the banner count as they are resolved

---

## Phase 8 — `usePermission` hook and wiring

**Run after Phase 7 deployed and permission seed data verified correct. One prompt per module.**

### Prompt 8.1 — `usePermission` hook

> **Create:** `src/hooks/usePermission.ts`
>
> ```typescript
> import { useQuery } from '@tanstack/react-query';
> import { supabase } from '@/integrations/supabase/client';
> import { useAuth } from '@/hooks/useAuth';
>
> const PERM_LEVELS: Record<string, number> = {
>   full: 3, limited: 2, owner_only: 1, none: 0,
> };
>
> export function usePermission(
>   featureKey: string,
>   minLevel: 'full' | 'limited' | 'owner_only' = 'limited'
> ): boolean {
>   const { user, profile } = useAuth();
>
>   // Fetch all permissions for this session (small table, cache 5 min)
>   const { data: permRows } = useQuery({
>     queryKey: ['role-permissions'],
>     enabled: !!user,
>     staleTime: 5 * 60 * 1000,
>     queryFn: async () => {
>       const { data } = await supabase
>         .from('role_permissions')
>         .select('feature_key, role, permission');
>       return data ?? [];
>     },
>   });
>
>   // Fetch user's roles from user_roles (includes additional roles)
>   const { data: userRoleRows } = useQuery({
>     queryKey: ['user-roles', user?.id],
>     enabled: !!user,
>     staleTime: 5 * 60 * 1000,
>     queryFn: async () => {
>       const { data } = await supabase
>         .from('user_roles')
>         .select('role')
>         .eq('user_id', user!.id);
>       return data ?? [];
>     },
>   });
>
>   if (!permRows || !profile) return false;
>
>   // Collect all roles the user holds: primary (unicorn_role) + additional (user_roles)
>   const allRoles = new Set<string>();
>   if (profile.unicorn_role) allRoles.add(profile.unicorn_role);
>   (userRoleRows ?? []).forEach((r) => allRoles.add(r.role));
>
>   // Return true if ANY of the user's roles meets the minimum permission level
>   for (const role of allRoles) {
>     const row = permRows.find(
>       (r) => r.feature_key === featureKey && r.role === role
>     );
>     const level = row ? (PERM_LEVELS[row.permission] ?? 0) : 0;
>     if (level >= PERM_LEVELS[minLevel]) return true;
>   }
>   return false;
> }
> ```
>
> ⚠️ **Known optimisation gap:** The hook makes two separate queries (`role_permissions` and `user_roles`). Both are cached at 5 minutes so this is not a blocking issue, but they can get out of sync during a cache miss window. A future improvement would merge them into a single query. Do not fix in this prompt — note for a follow-up.

### Prompt 8.2 — Wire Academy module

> Replace all hardcoded `isSuperAdmin`, `unicorn_role ===`, and `is_vivacity_team` checks in Academy pages with `usePermission('academy.*')` calls. Use the feature key map:
>
> - Tenant Access nav/toggle/edit → `usePermission('academy.tenant_access.manage')`
> - New Enrolment button → `usePermission('academy.enrolments.create')`
> - Export CSV / Revoke enrolment → `usePermission('academy.enrolments.revoke')`
> - Issue/revoke certificate → `usePermission('academy.certificates.issue')`
> - New Course / edit course → `usePermission('academy.builder.edit')`
> - Publish course → `usePermission('academy.builder.publish')`
> - View mapping page → `usePermission('academy.mapping.view')`
> - Edit mapping → `usePermission('academy.mapping.edit')`
>
> Do not remove Phase 5 gates — replace them in-place with `usePermission` calls.

### Prompt 8.3 — Wire Resource Hub

> Replace hardcoded role checks in Resource Hub pages with `usePermission('resource_hub.*')` calls. Map: view → `resource_hub.view`, upload/create → `resource_hub.upload`, approve/publish → `resource_hub.approve`, archive → `resource_hub.archive`.

### Prompt 8.4 — Wire EOS

> Replace hardcoded role checks across all EOS pages with `usePermission('eos.*')` calls using the feature keys in the Reference section above. Priority order: leadership dashboard, Mission Control edit, Flight Plan edit, QC create/view-all, GWC Trends, Rock Analysis, Client Impact.

### Prompt 8.5 — Wire Clients + Packages

> Replace hardcoded role checks in client management and package pages with `usePermission('clients.*')` and `usePermission('packages.*')` calls.

---

## Convention: adding a new gateable feature

Every time a developer adds a new page, button, or action that needs permission gating, the following must ship in the same PR — never separately.

**Step 1 — Gate the code:**
```typescript
// Frontend
const canAccess = usePermission('module.feature.action');

// Edge function
const { data: allowed } = await supabase.rpc('check_permission', {
  p_user_id: caller.id,
  p_feature_key: 'module.feature.action',
  p_min_level: 'full',
});
if (!allowed) return jsonError(403, 'FORBIDDEN');
```

**Step 2 — Ship a migration in the same PR:**
```sql
-- Register the feature
INSERT INTO public.permission_features (feature_key, label, module, category, sort_order)
VALUES ('module.feature.action', 'Human readable label', 'Module Name', 'Category Name', 999)
ON CONFLICT (feature_key) DO NOTHING;

-- Seed permissions for all active internal roles (adjust levels per RBAC v5)
INSERT INTO public.role_permissions (feature_key, role, permission)
SELECT 'module.feature.action', dr.value,
  CASE dr.value
    WHEN 'Super Admin'  THEN 'full'::public.permission_level
    WHEN 'Team Leader'  THEN 'full'::public.permission_level
    WHEN 'Integrator'   THEN 'none'::public.permission_level
    WHEN 'BGT'          THEN 'none'::public.permission_level
    WHEN 'CSC'          THEN 'none'::public.permission_level
    WHEN 'CET'          THEN 'none'::public.permission_level
  END
FROM public.dd_unicorn_roles dr
WHERE dr.is_internal = true AND dr.is_active = true
ON CONFLICT (feature_key, role) DO NOTHING;
```

If the migration is missing, the gaps query fires and the permission editor shows the unconfigured cells in amber. SA will see the warning and can configure from the editor — but the feature will be blocked for all non-SA staff until it is.

---

## Key constraints (do not violate)

- Every new gateable feature must ship `permission_features` + `role_permissions` seed in the same PR — never separately
- `check_permission` is the single gate for all three layers (UI hook, edge function, RLS) — do not add separate role string checks alongside it
- Phase 4 SQL must not run before Phases 2 and 3 are verified in production
- SA column in the permission editor is always Full — enforced in both UI and edge function
- `update-role-permission` must validate roles against `dd_unicorn_roles` dynamically — never hardcode
- All RBAC gates enforced at both UI layer (hide/show) and RLS/server layer independently
- Do not use `any` in TypeScript in new code
- Do not expose `role_permissions` to browser write — all writes through `update-role-permission` edge function
- Never combine the enum/dd_roles migration (1.3) with table creation (1.4) in the same Lovable prompt
- `user_roles` only stores additional roles — primary role stays in `users.unicorn_role`

---

## Open questions

- [ ] **CET members** — assign when confirmed by Angela. Use `user_roles` for any staff who hold CET as an additional role. Nobody assigned as at 10 June 2026.
- [x] **Hardcoded role lists in frontend components** — after Phase 4 deployed, 5 additional files were found with stale `["Super Admin", "Team Leader", "Team Member"]` arrays: `TenantTypeContext.tsx`, `DashboardLayout.tsx`, `ClientFilesTab.tsx`, `SharePointFolderConfig.tsx`, `PackageStagesManager.tsx`. All fixed. `v_dashboard_labour_efficiency` (DB view) also had the stale list — fixed 10 June 2026. Run a grep for `Team Member` inside array literals before any future role additions.
- [x] **`v_dashboard_labour_efficiency` stale role list** — fixed 10 June 2026 (direct SQL). Now includes CSC, BGT, Integrator, CET. See `dashboard-metrics-fix.md` Phase 4B.
- [ ] `user_roles` RLS currently allows all internal staff to read all assignments. If role assignments become sensitive, narrow to SA only.
- [ ] `usePermission` hook double-query optimisation — merge `role_permissions` + `user_roles` fetches into a single query or DB view (non-blocking, schedule as follow-up).
- [ ] After `'Team Member'` is set inactive (Phase 4), decide when to remove it from `dd_unicorn_roles` entirely — only safe once the `angela+invitetest` test account is decommissioned.
- [ ] **`rbac-v5.md` typo correction** — source spec used `CHC` (Client Host Champion) instead of `CSC` (Client Success Champion). Corrected in the workspace doc on 10 June 2026. Confirm Angela has updated her copy.
- [ ] **Trigger: `tenant_csc_assignments` → `tenants.assigned_consultant_user_id` sync** — 20 tenants had stale CSC data; manually backfilled 10 June 2026. A trigger to auto-sync on assignment change would prevent recurrence. Not yet built.
