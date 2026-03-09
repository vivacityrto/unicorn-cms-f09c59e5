

## Fix: Key Event Toggle Visibility and Visual Indicator

### Issues
1. The key event toggle is currently visible for **all** stages — it should only show for **recurring** stages.
2. When a task is flagged as a key event, the toggle button doesn't look distinct enough — needs a coloured key icon so it's obvious at a glance.
3. The "single key event per stage" enforcement should be removed — multiple key events per stage are valid.

### Changes

**`src/pages/AdminStageDetail.tsx`**:
- Wrap the KeyRound toggle button in a condition: only render when `(stage as any).is_recurring === true`
- Remove the logic that clears other key events when toggling one on (lines 1450-1455)
- Make the KeyRound icon use a vivid brand colour when active: `text-primary` (purple) instead of `text-amber-500`, so the key visually "lights up" when selected
- The existing amber badge next to the task name is fine for confirming the state

**`src/components/client/StageStaffTasks.tsx`**:
- No changes needed — the key badge already only renders when `is_key_event` is true

### Files
- `src/pages/AdminStageDetail.tsx` — conditional visibility, remove single-key-event enforcement, coloured key icon

