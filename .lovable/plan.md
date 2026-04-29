# Fix Suspended/Closed stat tile filters in ManageTenants

## Problem

The Suspended and Closed/Archived stat tiles set `statusFilter` to `"suspended"` or `"closed"`, but the filter block compares against `tenant.status` (raw column). Those lifecycle values only exist on the derived `lifecycle_status` column, so the filtered list is always empty.

## Change

Single edit in `src/pages/ManageTenants.tsx`, lines 301–304:

Replace:
```ts
// Status filter (using tenants.status column)
if (statusFilter !== "all") {
  filtered = filtered.filter(tenant => tenant.status === statusFilter);
}
```

With:
```ts
// Status filter — "all" and "active" match raw status;
// "suspended" and "closed" match lifecycle_status (derived column)
if (statusFilter !== "all") {
  filtered = filtered.filter(tenant =>
    statusFilter === "active"
      ? tenant.status === statusFilter
      : tenant.lifecycle_status === statusFilter
  );
}
```

## Out of scope

- onClick handlers on the stat tiles
- Other filter blocks (search, package, CSC)
- Schema, migrations, RLS, edge functions
