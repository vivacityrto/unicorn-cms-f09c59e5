## Wednesday Recent Activity polish — 3 file edits

All schema work is already live. UI-only.

### 1. `src/hooks/use-client-home-feed.ts`
Add `package_name: string | null` to the `HomeFeedRow` interface (line 27). Query already uses `select('*')`, so no fetch change.

### 2. `src/components/client/home/HomeRecentActivitySection.tsx`
Update `renderSubtitle` (lines 27–31) so `consult_logged` events fall back to `package_name` when `subtitle` is null:

```ts
function renderSubtitle(event: HomeFeedRow): string | null {
  if (event.event_type === "consult_logged") {
    if (event.subtitle) return formatWorkType(event.subtitle);
    return event.package_name ?? null;
  }
  return event.subtitle ?? null;
}
```

`formatWorkType` only runs when subtitle came from `event.subtitle`, never on the `package_name` fallback (already display-ready). Other event types (stage_completed, stage_released, task_completed) keep current behaviour. The existing `{subtitle && (...)}` guard in the render already omits the line when null — no layout change.

### 3. `src/components/client/package-dashboard/formatters.ts`
Add a defensive trailing `_mt`/`_qt`/`_yt` strip at the top of `formatWorkType`:

```ts
const cleaned = value.replace(/_(mt|qt|yt)$/i, '');
```

Then run the existing snake_case → Title Case conversion against `cleaned` instead of `value`. Update the JSDoc example so it doesn't promise that `governance_meeting_mt` becomes `Governance Meeting Mt`.

### Out of scope
No SQL. No changes to other home sections, hero, CSC card, packages strip, quick actions, Reporting Reminders, or any view.

### Acceptance
- `HomeFeedRow.package_name` typed as `string | null`.
- Bare consult/meeting rows with null subtitle now show the package name as the second line.
- `formatWorkType` strips trailing `_mt`/`_qt`/`_yt` defensively.
- Build clean, no `any`.
