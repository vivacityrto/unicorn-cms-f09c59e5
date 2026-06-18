## Scope
Two targeted UX improvements to `src/components/client/ViewAsClientButton.tsx`. No other files touched.

## Change 1 — Relationship role badge in user picker

Replace the `SelectItem` rendering (lines 237-242) with a two-line layout:
- First line: `opt.full_name`
- Second line: a small muted badge showing the mapped role label
- Remove the `" (Primary contact)"` string suffix entirely

Add a small helper inside the component (before the return):

```
function formatRoleLabel(role: string): string {
  switch (role) {
    case "primary_contact": return "Primary contact";
    case "secondary_contact": return "Secondary contact";
    case "academy_user": return "Academy user";
    case "user": return "User";
    default:
      return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
```

In the `SelectItem`, render:
```
<div className="flex flex-col leading-tight">
  <span>{opt.full_name}</span>
  <span className="text-xs text-muted-foreground">
    {formatRoleLabel(opt.relationship_role)}
  </span>
</div>
```

Keep `key`, `value`, `onValueChange` unchanged.

## Change 2 — Common reasons quick-select chips

Add a new local state: `const [selectedPreset, setSelectedPreset] = useState<string | null>(null);`

Above the existing `<Textarea>` (inside the "Reason for preview" block), insert a row of small chip buttons with these labels:
- "Support ticket"
- "Onboarding"
- "Team training"
- "Audit prep"

Each chip maps to a fill value:
- "Support ticket" → "Investigating support ticket"
- "Onboarding" → "Client onboarding assistance"
- "Team training" → "Training new team member"
- "Audit prep" → "Audit preparation"

Chip behaviour:
- Unselected: `variant="outline"`
- Selected: `variant="secondary"`
- Click unselected chip: set `selectedPreset` to that label, set `reason` to its fill value
- Click selected chip again: clear `selectedPreset` (null), clear `reason` ("")
- Typing in the `<Textarea>` manually: clear `selectedPreset` (null) so chips deselect and free-text mode is active

Keep `<Textarea>` always visible with existing `rows={3}`, `placeholder`, and help text.

## Preserved verbatim
- `handleViewClient` logic
- `handleStartPreview` logic
- `confirmDisabled` logic
- Dialog title/description logic
- `ActingUserOption` type (assumed unchanged)
- `ClientPreviewContext` and all other files untouched