## Problem

Step 2 of the New Team Member wizard blocks the user with "No active provisioning rule for admin_assistant / AU" and points them to "Admin → Staff Provisioning Rules", but:

1. **That admin page does not exist.** A search of `src/` shows `staff_provisioning_rules` is only referenced in `useStaffProvisioningRules.tsx` (hook) and `NewStarterWizard.tsx` (consumer). There is no route, no nav item, and no UI to create or edit rules.
2. **The current data is patchy.** There are 9 rules total: `admin_assistant` only exists for `PH`, `consultant` for both `AU`/`PH`, `software_developer` only for `PH`, etc. Any combination outside this matrix dead-ends the wizard.
3. **The user's intent:** all Vivacity staff are provisioned roughly the same way. The rule lookup was meant to *enrich* the provisioning (groups, licenses, software), not *gate* whether a starter can be created.

The recent change I made (in response to the previous "Next button disabled" report) actually made this worse — it elevated a soft warning into a hard block.

## Fix

Treat the resolved provisioning rule as **optional metadata**, not a precondition. The wizard should always allow the user to proceed; if no rule matches, the M365 preview just shows empty groups/licenses and the operator can complete provisioning manually (or we can add a default rule later).

### Changes — `src/pages/admin/NewStarterWizard.tsx`

1. **`canNext()` — Step 2:** Drop the `resolved.data` requirement. Revert to:
   ```ts
   case 2: return !!(form.roleCode && form.teamLeaderId);
   ```
2. **`canNext()` — Step 4:** Drop the `!!resolved.data` requirement; return `true`.
3. **Step 2 warning panel (lines ~426–436):** Soften from destructive red error to a neutral info panel:
   - Title: "No specific provisioning rule for {role} / {location}"
   - Body: "That's fine — defaults will be used. You can still proceed. Groups, licenses and software can be assigned manually in M365 after setup."
   - No mention of a non-existent "Staff Provisioning Rules" admin page.
4. **Step 4 fallback Card (lines ~497+):** Replace the "No provisioning rule found / Back to Step 2" dead-end with a `StaffProvisioningPreview` rendered against an empty default rule:
   ```ts
   const effectiveRule = resolved.data ?? {
     id: 0, role_code: form.roleCode, location_code: form.locationCode,
     m365_groups: [], licenses: [], software: [], calendars: [],
     notes: null, is_active: true,
   };
   ```
   Pass `effectiveRule` to `StaffProvisioningPreview` and to `psScript` generation. Preview will simply show "0 groups / 0 licenses" and the PowerShell script will create the user without group/license assignments.
5. **`provision()` guard (line 209):** Change `if (!resolved.data) return;` to allow proceeding with the empty default rule (pass through; the edge function already handles empty arrays for groups/licenses, since rules like `client_experience` already have empty license sets in production data).

### Out of scope (note for later)

If we want a true admin UI for `staff_provisioning_rules` and `dd_staff_role` / `dd_staff_location`, that is a separate piece of work — should be added under SuperAdmin → Code Tables alongside the other `dd_` lookups. Not doing it here.

### Files touched

- `src/pages/admin/NewStarterWizard.tsx` (only)

No DB migration, no new components, no edge function changes.
