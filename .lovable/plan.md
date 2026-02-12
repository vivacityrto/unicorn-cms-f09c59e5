

## Replace "Owner Seat" with "Owner (Team Member)" in Company Rock Dialog

### What Changes

The Company Rock creation dialog currently asks users to pick an **Owner Seat** (from the Accountability Chart). This will be replaced with an **Owner** dropdown that lists Vivacity team members by name and avatar -- the same pattern already used in the Team Rock and Individual Rock dialogs.

### How It Works

- The "Owner Seat" dropdown (using `accountability_seats`) is removed
- A new "Owner" dropdown appears in its place, listing Vivacity team members (Super Admin, Team Leader, Team Member)
- Each option shows the person's avatar and name
- The selected person's `user_uuid` is saved as `owner_id` on the rock

### What Stays the Same

- All other fields (title, description, issue, outcome, milestones, quarter, due date, AI suggest)
- The VTO mission banner
- The save/cancel logic

### Technical Details

**File: `src/components/eos/rocks/CreateCompanyRockDialog.tsx`**

1. Replace `seatId` state variable with `ownerId` state variable
2. Remove the `seats` query (lines 80-97) -- no longer needed
3. Import `Avatar`, `AvatarFallback`, `AvatarImage` and `User` icon
4. Remove `Armchair` icon import
5. Add `useVivacityTeamUsers` hook (already imported but not used for the dropdown)
6. Replace the "Owner Seat" `Select` block (lines 272-296) with a team member picker using `vivacityUsers`, showing avatar + name per option
7. Update `handleSubmit` to pass `owner_id: ownerId` instead of `seat_id: seatId`
8. Update `canSubmit` to check `ownerId` instead of `seatId`
9. Update `resetForm` to clear `ownerId` instead of `seatId`
10. Add a `getUserInfo` helper (same pattern as Individual Rock dialog)

**No database, migration, or edge function changes required.** The `CreateRockInput` interface already supports both `seat_id` and `owner_id`.

