## Problem

In `src/pages/admin/NewStarterWizard.tsx`, Step 4 ("Review & preview") gates both its content and the Next button on `resolved.data` (the row from `staff_provisioning_rules` matching `role_code` + `location_code`):

- Line 202: `case 4: return !!resolved.data;`
- Line 465: `{step === 4 && resolved.data && <StaffProvisioningPreview ... />}`

If the user picks a role + location combo that has no active rule, the preview card silently renders nothing **and** Next is disabled — exactly what the screenshot shows.

Currently configured rules in `staff_provisioning_rules`:

```text
admin_assistant     PH
business_growth     AU
client_experience   AU
client_success      AU
consultant          AU, PH
leadership          AU
senior_consultant   AU
software_developer  PH
```

So combinations like `admin_assistant + AU`, `leadership + PH`, `software_developer + AU`, etc. all silently dead-end at Step 4.

## Fix (UI-only, `src/pages/admin/NewStarterWizard.tsx`)

1. **Validate earlier, at Step 2.** Change `canNext()` for `case 2` to also require `resolved.data` (and not still loading). When the role + location combo has no rule, show an inline warning under the resolved-rules summary block (around lines 414–424) telling the user there is no active provisioning rule for `{roleCode} / {locationCode}` and to either pick another combo or add a rule in Admin → Staff Provisioning Rules. This stops users from getting trapped at Step 4.

2. **Make Step 4 honest when no rule resolves.** Replace the silent `{step === 4 && resolved.data && <StaffProvisioningPreview ... />}` with:
   - If `resolved.isLoading`: a small loading card.
   - If `resolved.data`: render `<StaffProvisioningPreview ... />` as today.
   - Else: a fallback `<Card>` explaining the rule is missing and offering a "Back to Step 2" button. Keep Next disabled in that branch (`case 4` stays `!!resolved.data`).

3. **No schema, hook, or edge-function changes.** Only `NewStarterWizard.tsx` is touched. `useResolvedRule` already returns `null` cleanly for missing combos; we are just surfacing that state.

## Out of scope

- Adding new provisioning rules (data task — flag separately if needed).
- Step 5 "Save in Unicorn" path: it already requires a successful provisioning rule on the backend, so no change.
- Visual restyle of the wizard.

## Acceptance

- Picking any role + location with no active rule shows a clear warning on Step 2 and Next is disabled there.
- Picking a valid combo (e.g. `consultant + AU`) lets the user move through Steps 2 → 3 → 4 → 5 normally.
- Step 4 never renders blank with a disabled Next and no explanation.
