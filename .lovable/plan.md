## Plan: Resolve package type labels on client packages page

### Background
The package type pill on `/client/packages` renders raw `package_type` codes (e.g. `regulatory_submission`) because the page has no access to `dd_package_type` labels. The lookup table already contains the correct human labels.

### Changes

#### 1. New hook: `src/hooks/usePackageTypeOptions.ts`
Mirror `useActionStatusOptions.ts` exactly, adapted for `dd_package_type`:
- Source table: `dd_package_type`
- Columns selected: `code, label, sort_order`
- Interface: `PackageTypeOption` with `code: string`, `label: string`, `sort_order: number`
- Hook returns: `{ options, loading }`
- Helper: `getPackageTypeLabel(code, options?)` — returns matching label, falls back to humanised title-case (same shape as `getActionStatusLabel`), returns `""` for null/undefined
- Module-level cache to avoid redundant fetches across renders

#### 2. Update `src/components/client/ClientPackagesPage.tsx`
- Import the new hook and helper
- Call `const { options: packageTypes } = usePackageTypeOptions();` inside `PackageCard`
- At line ~208, replace:
  ```tsx
  <Badge variant="secondary" className="text-xs">{dashboard.package_type}</Badge>
  ```
  with:
  ```tsx
  <Badge variant="secondary" className="text-xs">{getPackageTypeLabel(dashboard.package_type, packageTypes)}</Badge>
  ```
- Keep existing condition (`dashboard?.package_type && dashboard.package_type !== dashboard.package_name`) unchanged

### Out of scope
- No database changes (table already correct)
- No staff-facing UI changes
- No schema normalisation of `dd_package_type` (pre-existing `code` vs `value` variance)

### Verification
1. `tsc --noEmit` passes
2. Client packages page renders human label (e.g. "Regulatory Submission") instead of raw code
3. Badge styling unchanged; fallback humanisation works for unknown codes