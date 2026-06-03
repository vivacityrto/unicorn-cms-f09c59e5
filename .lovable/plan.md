## Objective
Lower the tenant name and commencement date text positions on the Ruby membership certificate PDF template.

## Scope
Only `supabase/functions/generate-membership-certificate/index.ts` — two numeric arguments on two existing `drawCentered` calls.

## Changes
| Line | Current | New |
|------|---------|-----|
| `drawCentered(tenantName ... 575)` | y = 575 | y = 465 |
| `drawCentered(formatAuDate(commencementDate) ... 435)` | y = 435 | y = 320 |

No other lines, files, or logic are modified.

## Verification
- Deploy the edge function after the edit.
- Test with a Ruby tenant via the `/client/certificate` page and verify text lands within the template blanks.
- Expect a possible follow-up fine-tune if positions still need a small nudge.