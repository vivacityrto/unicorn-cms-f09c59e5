## Goal

Build `src/features/pdp/components/GoalSheet.tsx` — a shadcn `Sheet` for creating and editing a `pdp_goals` row, validated with zod, wired through the existing `upsertGoal` API and React Query.

## Component API

```ts
interface GoalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  goal?: PdpGoal | null;   // present → edit mode
}
```

## Form fields

| Field | Type | Notes |
|---|---|---|
| `title` | text input | required, trim, 1–200 chars |
| `description` | textarea | optional, max 2000 |
| `standard_id` | `StandardsPicker` | optional, `allowClear` |
| `priority` | shadcn `RadioGroup` | High / Medium / Low → stored lowercase |
| `target_evidence_count` | number input | default 1, min 1, max 50 |
| `target_hours` | number input | optional, min 0, step 0.5 |
| `status` | `Select` | edit-only: Open / In progress / Met / Not met / Deferred |

## Validation (zod)

```ts
const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  standard_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["high","medium","low"]),
  target_evidence_count: z.coerce.number().int().min(1).max(50),
  target_hours: z.coerce.number().min(0).max(1000).optional().nullable(),
  status: z.enum(["open","in_progress","met","not_met","deferred"]).optional(),
});
```

Use `react-hook-form` + `zodResolver` (already used elsewhere in the project). Inline `FormMessage` errors via shadcn `Form` primitives.

## Behaviour

- Sheet `side="right"` on desktop. For mobile (<640px) render with `side="bottom"` and `max-h-[90vh] overflow-y-auto`. Detect via existing `useIsMobile()` hook (`@/hooks/use-mobile`).
- Title/description: "Add goal" / "Edit goal" depending on mode.
- On open in edit mode, reset form from `goal` props; in create mode reset to defaults (`priority: "medium"`, `target_evidence_count: 1`, `status` hidden).
- Submit:
  - Build `UpsertGoalInput` — include `id` if editing, always include `cycle_id`. Coerce empty `description` to `null`, empty `target_hours` to `null`, empty `standard_id` to `null`. Status only sent when editing.
  - Call mutation wrapping `upsertGoal`.
  - On success: `queryClient.invalidateQueries({ queryKey: ["pdp","goals", cycleId] })`, `toast.success("Goal saved")`, close sheet.
  - On error: `toast.error(err.message ?? "Failed to save goal")`. Keep sheet open.
- Submit button disabled while `isPending` and shows spinner text "Saving…".
- Cancel button closes the sheet without submitting.

## Mutation hook

Add `useUpsertGoal(cycleId)` to `src/features/pdp/hooks.ts` to encapsulate the mutation + invalidation. Export from existing hooks barrel — no other consumer changes.

## Wiring

Out of scope: replacing the existing placeholder `AddGoalSheet` in `src/components/academy/pdp/AddGoalSheet.tsx` or hooking into Goals tab buttons. Those will be swapped over in a later prompt; this prompt only delivers the reusable component + hook.

## Files

- **New**: `src/features/pdp/components/GoalSheet.tsx`
- **Edit**: `src/features/pdp/hooks.ts` — add `useUpsertGoal`
