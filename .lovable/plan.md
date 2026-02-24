

## Add Client Search/Navigation Below "View as Client"

### What this does
Adds a searchable client selector underneath the "View as Client" button on the tenant detail page. This lets you quickly jump to another client without going back to the clients list.

### How it works
- A new `ClientQuickNav` component will render as a compact combobox search field
- It will fetch all tenants (id + name) and let you type to filter
- Selecting a client navigates you directly to that tenant's detail page
- It will appear below the "View as Client" button in both `TenantDetail.tsx` and `ClientDetail.tsx`

### Technical Details

**New component: `src/components/client/ClientQuickNav.tsx`**
- Reuses the same `Command`/`Popover` pattern from the existing `TenantCombobox`
- Fetches tenants via `supabase.from('tenants').select('id, companyname')` on mount
- On selection, calls `navigate(/tenant/{id})`
- Excludes the current tenant from results
- Compact styling with a `Search` icon and "Jump to client..." placeholder

**Modified files:**
1. `src/pages/TenantDetail.tsx` -- Add `<ClientQuickNav currentTenantId={tenantId} />` after the `ViewAsClientButton` block (around line 593)
2. `src/pages/ClientDetail.tsx` -- Add `<ClientQuickNav currentTenantId={tenantIdNum} />` after the `ViewAsClientButton` (around line 277)

