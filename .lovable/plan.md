

## Propagate Package `total_hours` to Active Instances with Confirmation

### Problem
Updating `total_hours` on a package doesn't update `included_minutes` on existing `package_instances`. The user wants this propagation to only target **active** instances and to be **prompted** before it happens (some instances should remain unchanged).

### Approach

After saving a package with a changed `total_hours`, show a **ConfirmDialog** asking whether to update active instances. If confirmed, update only `package_instances` where `package_id = X` and `status = 'active'`, setting `included_minutes = new_total_hours * 60`.

### Files Modified

**1. `src/hooks/usePackageBuilder.tsx` — `updatePackageData`**
- Return the updated data so the caller knows if `total_hours` changed
- No propagation logic here — the caller handles the prompt

**2. `src/components/package-builder/PackageBuilderEditor.tsx`**
- After `updatePackageData` succeeds, if `total_hours` is in `formData`, show a ConfirmDialog asking: *"Update active instances? This will set included hours to {X} for all active instances of this package."*
- On confirm: run `supabase.from('package_instances').update({ included_minutes: total_hours * 60 }).eq('package_id', id).eq('status', 'active')`
- Add state for `showPropagateDialog` and render `ConfirmDialog` (already exists in the design system)

**3. `src/components/AddPackageDialog.tsx`** (edit branch)
- Same pattern: after successful update with changed `total_hours`, show ConfirmDialog
- On confirm, propagate to active instances only

**4. `src/components/EditPackageDialog.tsx`**
- Add `total_hours` field to the form (currently missing)
- After save, if `total_hours` changed, show ConfirmDialog → propagate to active instances on confirm

### Confirmation Dialog Details
- Uses existing `ConfirmDialog` component with `variant="warning"`
- Title: "Update Active Package Instances?"
- Description: "This will update the included hours to {X}h for all active instances of this package. Instances that should keep their current hours can be edited individually."
- Confirm: "Update Active Instances" / Cancel: "Skip"

