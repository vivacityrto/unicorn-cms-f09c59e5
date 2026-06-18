## Plan: Refine Client Contact Register (BulkMembershipCertificatesPage)

File: `src/pages/admin/BulkMembershipCertificatesPage.tsx` — three targeted changes only. Everything else preserved verbatim.

### Change 1 — Fix the Group column
- In `fetchTenants` merge, update `package_slug`:
  `package_slug: (pkg?.slug ?? "").replace(/^\/package-/i, "").toUpperCase()`
- In the Group table cell, replace the `<Badge>` with plain bold text:
  `<span className="font-semibold">{tenant.package_slug || "—"}</span>`

### Change 2 — Add CSC column with per-CSC colours
- Add `CSC_COLORS` array and `getCscColor(name)` helper inside the component (above `return`).
- Insert a new "CSC" `<TableHead>` between Group and Code / Client.
- Insert a matching `<TableCell>` in each row (between Group and Code/Client cells):
  - If `tenant.csc_name` exists, render a `<Badge>` using `getCscColor(tenant.csc_name)`.
  - Otherwise render "—".
- Update empty-state `colSpan` from `6` to `7`.

### Change 3 — Replace owner tabs with a filter bar
- Remove the entire owner-tabs `<div>` block (pills for "All Owners" + per-CSC buttons).
- Add state:
  - `const [activeGroup, setActiveGroup] = useState<string | null>(null);`
  - `const [activeStatus, setActiveStatus] = useState<string | null>(null);`
- Add `useMemo` derived values:
  - `uniqueGroups`: distinct non-empty `package_slug` values, sorted.
  - `uniqueStatuses`: distinct non-empty `status` values, sorted.
- Update `visibleTenants` `useMemo` to also filter by `activeGroup` and `activeStatus` (in addition to existing `activeOwner` and `searchQuery` logic).
- Replace the removed tabs block with a single `<div className="flex flex-wrap items-center gap-3">` containing:
  1. **CSC Select** — bound to `activeOwner`; "All CSCs" resets to `null`; options from `ownerTabs.map(([name]) => name)`.
  2. **Group Select** — bound to `activeGroup`; "All Groups" resets to `null`; options from `uniqueGroups`.
  3. **Status Select** — bound to `activeStatus`; "All Statuses" resets to `null`; options from `uniqueStatuses`, label via `statusLabelMap.get(value) ?? value`.
  4. **Search input** — moved here with `className="ml-auto"`; same behaviour as before.
- Add import for `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`.

### Preserved verbatim
- `handleDownload` function
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`
- RBAC navigation guard
- All fetch queries, maps, and merge logic (except the one `package_slug` line above)
- `DashboardLayout`, page header, bulk download card, progress block
- JSZip import and usage, toast messages