## Replace Misleading Status Column on Client Portal Users Page

### Goal
Rewrite the `StatusDot` component in `src/components/client/ClientUsersPage.tsx` to derive an honest activity status from `last_sign_in_at` instead of showing a flat "Active" label for every enabled account.

### Derivation rule (left-to-right priority, only for `row_type === 'active'`)

```text
1. row.status === 'disabled'           → "Disabled"        (red dot)
2. row.last_sign_in_at IS NULL         → "Never signed in" (grey text, no dot)
3. (now - last_sign_in_at) < 30 days   → "Active"          (green dot)
4. otherwise                           → "Inactive"        (amber dot)
```

For `row_type === 'invited'` entries, preserve the existing rendering (amber dot + "Invited" + `SentIndicator`).

### Changes

- **Import** `differenceInDays` from `date-fns` alongside existing `formatDistanceToNow` and `parseISO`.
- **Rewrite `StatusDot`** function:
  - Branch on `row.row_type === 'invited'` first — return the current invited layout unchanged.
  - For active rows, apply the 4-step priority rule above.
  - Colour tokens:
    - Active → `bg-emerald-500`
    - Inactive → `bg-amber-500`
    - Disabled → `bg-destructive`
    - Never signed in → no dot, text in `text-muted-foreground`
  - Add a native `title` attribute to the outer wrapper showing the raw `last_sign_in_at` timestamp when present.
- Keep the `<TableHead>Status</TableHead>` column header unchanged.
- No changes to `LastActive`, `RolePill`, `UserCell`, or any other component in the file.

### Verification

- `tsc --noEmit` must pass.
- In the preview on `/client/users`:
  - Recent sign-ins → green "Active"
  - `last_sign_in_at` older than 30 days → amber "Inactive"
  - `last_sign_in_at` is `null` → grey "Never signed in" (no dot)
  - `status === 'disabled'` → red "Disabled" (overrides everything)
  - Invited rows → unchanged
- Hovering any active-status badge reveals the raw `last_sign_in_at` timestamp as a native browser tooltip.