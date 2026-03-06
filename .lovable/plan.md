

## Clickable OrgTypeBadge — Revised Plan

**Change from previous plan:** GTO is excluded entirely. The popover only applies to RTO, CRICOS, and RTO+CRICOS org types.

### Files to change

**1. `src/components/tenant/OrgTypeBadge.tsx`**
- Add optional props: `rtoNumber?: string`, `cricosNumber?: string`
- Wrap badge in a `Popover` when linkable codes exist
- Show popover with clickable code rows based on `orgType`:
  - **RTO**: RTO Number → `https://training.gov.au/Organisation/Details/{code}`
  - **CRICOS**: CRICOS Code → `https://cricos.education.gov.au/Institution/InstitutionDetails.aspx?ProviderCode={code}`
  - **RTO + CRICOS**: Both links
  - **GTO / other**: No popover, badge stays static
- Filter out empty, "TBC", "TBA", "NA", "N/A" values
- Add `cursor-pointer` only when popover is active

**2. `src/pages/ClientDetail.tsx`**
- Pass `rtoNumber={profile?.rto_number}` and `cricosNumber={profile?.cricos_number}` to `OrgTypeBadge`

