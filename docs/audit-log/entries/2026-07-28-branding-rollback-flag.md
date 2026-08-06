# Audit: 2026-07-28 — branding-rollback-flag

**Trigger:** ad-hoc (hand-written schema change shipped as a `unicorn-cms-f09c59e5` git hotfix, not routed through a Lovable prompt)
**Scope:** New `public.public_branding_config` table + RLS policies, added to support a runtime rollback flag for the primary-color/font branding change in PR #72 (`hotfix/table-chip-layout-fixes`). Did not touch `app_settings` or any other existing table.

## Findings
- `app_settings` (the existing single-row feature-flag table) is `SELECT`-restricted to Vivacity staff/super admins via RLS (`is_super_admin_safe(auth.uid()) OR is_vivacity_team_safe(auth.uid())`), which doesn't work for a flag that must be readable by every signed-in user, including client-portal roles (`primary_contact`, `secondary_contact`, `academy_user`).
- No general-purpose "public config" table existed for an app-wide, non-sensitive, everyone-readable toggle.

## KB changes shipped
- no changes

## Codebase observations (read-only)
- `unicorn-cms-f09c59e5` @ `4348e719` (branch `hotfix/table-chip-layout-fixes`, PR #72): added `public.public_branding_config` (single row, `legacy_branding_enabled boolean default false`), `useLegacyBrandingFlag` hook, `BrandingFlagGuard` in `App.tsx`, `.legacy-branding` CSS override block in `index.css`.

## Decisions
- Created a new table rather than loosening `app_settings` RLS, to avoid exposing SharePoint URLs / AI settings / other admin config to client-portal accounts.
- Write access restricted to `is_super_admin()` only; read is open to all `authenticated` users, matching the existing `app_settings_write_sa` write-restriction pattern but with broader read.
- Flag semantics: `legacy_branding_enabled = false` (default) = new Purple/Anton branding live; `= true` = reverts to the old Aqua color + default fonts. Default requires no action and matches what's already shipped.

## Open questions parked
- If the new branding is permanently rejected, this flag + table should eventually be removed and the CSS values reverted directly, rather than carrying a permanent rollback path indefinitely.

## Tag
audit-2026-07-28-branding-rollback-flag
