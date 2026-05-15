## Bug Fix: Update TEAM_LABELS in UserProfileCard.tsx

### Problem
`src/components/UserProfileCard.tsx:8-14` defines `TEAM_LABELS` using pre-1-Feb-2026 enum keys (`csc`, `csc_admin`, `growth`, `other`). The current valid `staff_team` values are `business_growth`, `client_success`, `client_experience`, `software_development`, `leadership`. Because only `leadership` overlaps (and zero users have it), the team badge has not rendered for any staff user since the enum reset.

### Fix
Replace lines 8-14 with a dictionary keyed on the current `dd_staff_team` values:

- `business_growth`      → label `Business Growth`,      color `purple`
- `client_success`       → label `Client Success`,       color `emerald`
- `client_experience`    → label `Client Experience`,    color `cyan`
- `software_development` → label `Software Dev`,         color `blue`
- `leadership`           → label `Leadership`,           color `amber`

Tailwind color pattern preserved: `bg-{color}-500/10 text-{color}-700 border-{color}-200`.

### Scope & Safety
- **Only file touched:** `src/components/UserProfileCard.tsx`
- **No logic changes:** Conditional render at lines 73-77 (`user.staff_team && TEAM_LABELS[user.staff_team] && (...)`) stays exactly as-is.
- **No 'none' entry added:** Short-circuit for `staff_team = 'none'` continues to suppress the badge.
- **No legacy keys retained:** `csc`, `csc_admin`, `growth`, `other` removed.
- **Out of scope:** AdminActions.tsx, TeamUsers.tsx, ProfileHeader.tsx, database objects, types, RLS, edge functions.

### Verification
- `user.staff_team = NULL` → badge suppressed (unchanged).
- `user.staff_team = 'none'` → badge suppressed (unchanged).
- `user.staff_team = 'leadership'` → badge renders (unchanged behaviour, now valid).
- Any of the four new keys → badge renders with correct label and color.