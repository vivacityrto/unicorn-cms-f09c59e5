

## Re-Registration Due Date Display

### Format clarification
The label format is: `RE-REGISTRATION DUE: DDD DD-MMM-YYYY`
Example: `RE-REGISTRATION DUE: Tue 15-Jul-2026`

Where DDD = day of week abbreviation (Mon, Tue, Wed, Thu, Fri, Sat, Sun).

### What changes
Display the re-registration due date (90 days before TGA registration end date), color-coded:
- **Red**: < 30 days away
- **Amber**: 31–90 days away
- **Green**: > 90 days away

### Location 1: Membership year line (ClientTimeSummaryCard)
Right-justify the label on the existing "Membership year" line. Always visible, color-coded.

### Location 2: Sticky time tracker bar (TenantTimeTrackerBar)
When **amber or red only**, show in bold larger font in the spare space on the bar. Hidden when green.

### Files to create

**`src/lib/reRegistrationDate.ts`**
- `getReRegistrationDueDate(registrationEndDate)` — returns date 90 days prior
- `getReRegistrationUrgency(dueDate)` — returns `'red' | 'amber' | 'green'`
- `formatReRegistrationLabel(dueDate)` — returns e.g. `"Tue 15-Jul-2026"` using `format(date, "EEE dd-MMM-yyyy")`

**`src/components/shared/ReRegistrationBadge.tsx`**
- Takes `registrationEndDate` prop, renders `RE-REGISTRATION DUE: DDD DD-MMM-YYYY` with color
- Props for `bold`/`large` variants (for sticky bar use)

### Files to modify

**`src/components/client/ClientTimeSummaryCard.tsx`**
- Query `registration_end_date` from `tenant_profile` using `tenantId`
- Make membership year line a flex row with `justify-between`
- Add `<ReRegistrationBadge>` on the right

**`src/components/client/TenantTimeTrackerBar.tsx`**
- Query `registration_end_date` from `tenant_profile`
- When amber/red, render bold larger `<ReRegistrationBadge>` in the spare space

