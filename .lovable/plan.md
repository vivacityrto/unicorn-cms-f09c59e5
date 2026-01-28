

# Plan: Use Package Instance ID for Date Fetching

## Problem

The current implementation fetches `start_date` and `end_date` by filtering `package_instances` with `package_id`, `tenant_id`, and `is_complete = false`. However, this can return **multiple rows** when a tenant has multiple active instances of the same package (as seen with tenant 6357 having two active Membership instances).

## Solution

Update the route and data flow to pass the `package_instances.id` directly, ensuring dates are fetched for the correct specific instance.

---

## Technical Implementation

### 1. Update Route Structure

**File: `src/App.tsx`**

Change the route from:
```
/admin/package/:id/tenant/:tenantId
```
To include the instance ID:
```
/admin/package/:id/tenant/:tenantId/instance/:instanceId
```

### 2. Update Navigation from ClientPackagesTab

**File: `src/components/client/ClientPackagesTab.tsx`**

Change the navigation (line 229) to include the package instance ID:

```tsx
// From:
navigate(`/admin/package/${pkg.package_id}/tenant/${tenantId}`);

// To:
navigate(`/admin/package/${pkg.package_id}/tenant/${tenantId}/instance/${pkg.id}`);
```

### 3. Update AdminPackageTenantDetail to Extract Instance ID

**File: `src/pages/AdminPackageTenantDetail.tsx`**

Update `useParams` to include the new `instanceId` parameter and pass it to `PackageDetail`:

```tsx
const { id: packageId, tenantId, instanceId } = useParams();
// ...
<PackageDetail instanceId={instanceId} />
```

### 4. Update PackageDetail to Use Instance ID

**File: `src/pages/PackageDetail.tsx`**

- Accept optional `instanceId` prop
- Update the date fetch query to use `id` directly instead of the composite filter:

```tsx
// Current (problematic):
.eq("package_id", Number(id))
.eq("tenant_id", Number(tenantId))
.eq("is_complete", false)
.single();

// Updated (correct):
.eq("id", Number(instanceId))
.single();
```

### 5. Handle Fallback for Direct Navigation

If someone navigates directly without instance ID, fall back to fetching the most recent active instance:

```tsx
if (instanceId) {
  // Direct fetch by ID
  const { data } = await supabase
    .from("package_instances")
    .select("start_date, end_date")
    .eq("id", Number(instanceId))
    .single();
} else if (tenantId) {
  // Fallback: get most recent active instance
  const { data } = await supabase
    .from("package_instances")
    .select("start_date, end_date")
    .eq("package_id", Number(id))
    .eq("tenant_id", Number(tenantId))
    .eq("is_complete", false)
    .order("start_date", { ascending: false })
    .limit(1)
    .single();
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add `/instance/:instanceId` to route |
| `src/components/client/ClientPackagesTab.tsx` | Include `pkg.id` in navigation URL |
| `src/pages/AdminPackageTenantDetail.tsx` | Extract `instanceId` from params, pass to child |
| `src/pages/PackageDetail.tsx` | Accept `instanceId` prop, query by ID |

---

## Data Integrity

This change ensures:
- Each package card links to its specific instance
- Historical instances (if shown) would link correctly
- Dates displayed always match the specific instance being viewed

