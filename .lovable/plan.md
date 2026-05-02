## Card title — read friendly name from the dashboard view

### Root cause

`src/components/client/ClientPackagesPage.tsx` line 94 renders the card title from `pkg.package?.name` — the short code (`M-DR`, `KS-RTO`, …) returned by `useClientPackageInstances` (which selects `packages.name` directly).

The card already calls `useClientPackageDashboard(packageInstanceId)` and `dashboard.package_name` now resolves to `COALESCE(NULLIF(TRIM(packages.full_text), ''), packages.name)` — i.e. friendly name with short-code fallback. The title just needs to follow the view.

### Change

One file, one component, ~5 lines.

**`src/components/client/ClientPackagesPage.tsx`**, inside `PackageCard` (lines 94–97):

- Title source: `dashboard?.package_name ?? pkg.package?.name ?? "Package"`.
  - `pkg.package?.name` stays only as a loading placeholder for the brief window before the dashboard query resolves, and as a final null-safety fallback (which the view itself already covers — the COALESCE means `package_name` is non-null whenever a package row exists).
- Update the tier-pill dedup check on the next line to compare `dashboard.package_type` against the displayed title (`dashboard?.package_name ?? pkg.package?.name`) instead of just the short code, so the pill still hides when type and name happen to match.

No changes to:
- `useClientPackageDashboard` hook
- `v_client_package_dashboard` view (or any other view / SQL)
- `useClientPackageInstances` (still needed for the package list and instance metadata)
- `PackageStatusPill`, `PackageStatTiles`, `PackageActionRow`, `PackageStageStepper`, `PackageWhatsNextPanel`, `PinnedNoteBanner`
- Any staff / admin surface that intentionally shows the short code (`AdminManagePackages`, `AdminPackageTenantDetail`, `PackageDetail`, etc.) — they don't import this component.

### Verification (post-deploy, impersonating tenants)

- Australian College M-DR card → "Diamond RTO Membership"
- AHMRC M-DR card → "Diamond RTO Membership"
- A non-membership tenant (KS-RTO / CHC / RTO Documents) → friendly name
- A tenant on a package where `full_text IS NULL` (e.g. SH-AR / Rail Ready) → graceful short-code fallback, no `null`/`undefined`
- Tier pill, Hours, Stages, Open tasks, Last activity, status pill, banner, stepper, What's Next all unchanged
