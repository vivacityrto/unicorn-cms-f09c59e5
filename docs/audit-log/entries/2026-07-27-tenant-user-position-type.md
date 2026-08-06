# Audit: 2026-07-27 — tenant-user-position-type

**Trigger:** ad-hoc — Carl requested a Position Type dropdown for tenant users (CEO/Owner, Compliance, Administration, Finance, Manager, Trainer/Assessor), backed by an extensible lookup table.
**Scope:** Schema change (new lookup table + FK column) plus UI across two separate tenant-user surfaces, authored directly in `unicorn-cms-f09c59e5` under Carl's explicit in-session override, bypassing the usual Lovable-prompt workflow. Did not touch `unicorn-kb/` architecture docs (no existing doc described `job_title`/position lookups, so nothing to reconcile).

## Findings
- Prior to this change, the only "position" concept on tenant users was `users.job_title` — free text, global to the person (not tenant-scoped), no lookup table.
- The codebase has an established `dd_*` lookup-table convention (e.g. `dd_relationship_role`: id/value/label/sort_order/is_active, RLS "authenticated read" only, consuming column is a `text` FK to the lookup's `value`). This change clones that convention rather than introducing a new pattern.
- `RELATIONSHIP_ROLE_OPTIONS` (the existing precedent) hardcodes its lookup values client-side rather than fetching them live — a known inconsistency. This change deliberately does NOT repeat that: the Position Type dropdown fetches `dd_position_type` live at render time, so future position types can be added via a DB insert with no frontend redeploy.
- Two separate, previously-known-inconsistent UIs surface tenant users (`unicorn-kb/codebase-state/super-admin-exploration-2026-05-21.md`): the superadmin flat directory at `/admin/tenant-users` (reads `public.users` directly) and the per-tenant "Team Members" tab at `/client/users` (reads `tenant_users`). Position Type needed separate wiring in each, since they query different tables — this reinforced that the two-UI duality documented in that KB doc is still live and still a source of double-implementation cost.

## KB changes shipped
- no changes (no existing KB doc described this area; nothing stale to reconcile)

## Codebase observations (read-only → then changed)
- unicorn-cms-f09c59e5 @ `3ed42dc658b518069f231aa2462b01bec39e079d` (`main`, after three merged PRs):
  - **PR #52** (`ac5fca3308f7278f4a3c2377d61a916cda0619c6`, branch `hotfix/tenant-user-position-type`) — merged `1a10417e7d3381bcb90fa7f0fc04da5e6e383c35`:
    - New migration `supabase/migrations/20260727150030_add_tenant_user_position_type.sql`: creates `dd_position_type` (seeded with 6 values: ceo_owner, compliance, administration, finance, manager, trainer_assessor), RLS authenticated-read-only, no write policy; adds `tenant_users.position_type` (nullable text, FK to `dd_position_type(value)`, `ON UPDATE CASCADE ON DELETE RESTRICT`).
    - Hand-edited `src/integrations/supabase/types.ts` to match (couldn't regenerate from live schema at the time — migration wasn't applied yet).
    - New `src/lib/roles/positionType.ts` helper (type + label lookup, no hardcoded options array by design).
    - `src/components/client/TenantUsersTab.tsx` (`/client/users`): fetches `dd_position_type` on mount, adds it to the `tenant_users` select, adds a Position Type `Select` to the edit drawer, persists via a direct `tenant_users` update (no RPC needed — unlike `relationship_role`, position type carries no access-control side effects), displays the label as a badge in the row list.
    - Migration applied directly to production (project `yxkgdalkbrriasiyyrwk`) via Supabase MCP after merge — pre-flight check confirmed neither `dd_position_type` nor `tenant_users.position_type` existed beforehand; post-apply query confirmed all 6 seed rows; security advisors showed no new findings against the new table.
  - **PR #53** (`d9479a80`, branch `hotfix/tenant-user-position-type-admin-page`) — merged `94dd42a46c4440aa07b352b9358f04618a20a62f`:
    - `src/pages/TenantUsers.tsx` (`/admin/tenant-users`): added Position Type column (read-only at this point), filter dropdown, and CSV export (respects active filters; columns include name/email/tenant/position type/role/status/last login). Position type pulled in via an embedded `tenant_users!tenant_users_user_id_fkey(tenant_id, position_type)` join since this page reads `public.users` directly, matched client-side against the row's existing `tenant_id`.
  - **PR #54** (`ae3317a9`, branch `hotfix/tenant-user-position-type-inline-edit`) — merged `3ed42dc658b518069f231aa2462b01bec39e079d`:
    - Same page: Position Type made directly editable inline (row-level `Select` writing straight to `tenant_users.position_type`), with row-navigation click-through suppressed on that cell (same pattern as the existing checkbox column).
    - Tenant filter switched from single-select to multi-select, reusing the existing `MultiSelect` component (`src/components/documents/bulk-generate/MultiSelect.tsx`) rather than building a new one.
  - `npx tsc --noEmit` passed with no errors after every PR. No end-to-end Playwright/browser smoke test was performed in any of these sessions — verification was type-check + code review + a live SQL check of the seeded lookup rows post-migration.

## Decisions
- Position type is single-valued per tenant-user membership (not multi-select) — confirmed with Carl before implementation.
- Position type lives on `tenant_users` (per-tenant membership), not `users` (global person) — matches Carl's literal request ("add another column ... for tenant users") and is more correct than colocating with `job_title`, since a person's position is tied to their role at a specific RTO, not a global attribute.
- No admin CRUD UI for managing `dd_position_type` rows — matches the `dd_relationship_role` precedent (no dev-facing management screen for any existing `dd_*` table); new position types are added via a future migration/service-role insert. Flagged as an assumption, not explicitly requested either way.
- Position Type is editable from both surfaces: the `/client/users` edit drawer (PR #52) and inline directly in the `/admin/tenant-users` row (PR #54) — Carl asked for editing on the admin page specifically after seeing it render read-only there, so this shipped as a direct in-row edit rather than routing admins through the client-side drawer.

## Open questions parked
- Whether `dd_position_type` should eventually get an admin-facing management UI (add/edit/deactivate rows without a migration) — not requested this session; current scope matches the existing `dd_*` convention of migration-managed reference data.
- `users.job_title` (free text) was left untouched and still exists alongside the new structured `position_type` — no request was made to deprecate or migrate it, and the two capture different things (job title vs. a fixed six-value classification).
- No hands-on Playwright/browser smoke test has been run against the live app for any of the three PRs (inline edit, filter, CSV export, client-portal drawer). Recommended before relying on this for real client data — see `unicorn-kb/pinned/... ` QA account guidance (standardized `carl+...@complyhub.ai` test tenants, not real client accounts).
- The two-UI duality (`/admin/tenant-users` vs `/client/users`) already flagged in `super-admin-exploration-2026-05-21.md` cost real implementation effort here (three PRs instead of one) — worth considering whether to unify or explicitly document the split responsibility if a third tenant-user-facing surface is ever added.

## Tag
audit-2026-07-27-tenant-user-position-type
