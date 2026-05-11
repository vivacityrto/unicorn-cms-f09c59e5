# Quick Reflection Drawer (Additive)

## Context Verified
- `addReflection` already exists in `src/features/pdp/api.ts` and stamps `user_id` from `auth.uid()`.
- `useAddReflection(cycleId)` already exists in `src/features/pdp/hooks.ts` — will reuse, no duplicate added.
- DB: `pdp_reflections` has nullable `cycle_id`, nullable `lesson_progress_id`, required `response`. Compatible with prompt.
- `AcademyLessonViewerPage.tsx`: `autoCompleteLesson` (line 210) is the actual point where `is_completed` flips to true; `upsertProgress` (line 191) is a generic helper that never sets `is_completed`. The completion trigger fires in `VimeoPlayer.onCompletionThresholdReached` (line 559/563) → calls `autoCompleteLesson`.
- The existing `currentProgress` query does not select `id`. We need `lesson_progress_id` for the reflection row, so we'll do a lightweight ad-hoc fetch inside the new effect (no edit to existing queries).

## Trigger Strategy (Non-Invasive)
Do **not** edit `autoCompleteLesson`, `upsertProgress`, `VimeoPlayer` props, or any existing query. Instead, add a **new `useEffect`** that watches `completedLessonIds` (already invalidated by `autoCompleteLesson`) and `currentProgress.is_completed`. When the current `lesson.id` transitions from "not in completed set" → "in completed set" during this session (tracked via a `useRef` latch keyed by lesson id so we don't re-prompt on remount/refresh of an already-completed lesson):
1. Fetch the `pdp_lesson_progress` row id via a one-shot `supabase.from("academy_lesson_progress").select("id").eq("enrollment_id", …).eq("lesson_id", …).maybeSingle()`.
2. Open the drawer with that id.

A second ref `promptedLessonsRef = useRef<Set<number>>` ensures the drawer only opens once per lesson per page session and never for lessons already completed before this mount.

## Files

### 1. `src/features/pdp/hooks.ts` (edit)
- Add `useUnattachedReflections(userId)`:
  - queryKey: `["pdp", "unattached-reflections", userId ?? null]`
  - query: `select("id", { count: "exact", head: true }).eq("user_id", userId).is("cycle_id", null)`
  - returns `{ count: number }`
- `useAddReflection` already exists — leave intact. Extend its `onSuccess` only if needed to also invalidate `["pdp","unattached-reflections"]` so the dashboard badge updates immediately when an unattached one is created. (Backwards compatible — additive invalidation.)

### 2. `src/pages/client/AcademyLessonViewerPage.tsx` (edit, additive)
- New imports: `useAuth`, `useCurrentCycle`, `useAddReflection` from PDP hooks; new component `QuickReflectionDrawer` (see below).
- Resolve `userId` and `tenantId` from `useAuth` (page already uses `actingUserId` for academy acting-user — but reflections must be the real auth user per prompt: `user_id = auth.uid()`).
- Resolve current cycle: `useCurrentCycle(authUserId, tenantId)` → may return null.
- New state: `reflectionOpen`, `reflectionLessonProgressId: number | null`, `reflectionLessonTitle: string | null`.
- New refs: `promptedLessonsRef = useRef<Set<number>>(new Set())`, plus snapshot of `completedLessonIds` on first load to skip lessons already completed at mount.
- New `useEffect` (deps: `lesson?.id`, `completedLessonIds`, `currentProgress?.is_completed`, `enrollment?.enrollment_id`):
  - If lesson missing or already in initial-completed set → mark prompted, return.
  - If lesson now completed AND not prompted yet → fetch progress id, set state, open drawer.
- Render `<QuickReflectionDrawer />` at end of JSX, outside main layout flow. Built with shadcn `Drawer` (mobile-first / responsive, non-modal so it does not block lesson navigation — uses `modal={false}` so user can keep clicking sidebar / next lesson). Width auto, bottom sheet on mobile.
  - Title: "Quick reflection (optional)"
  - Body: prompt text + `Textarea rows={3} maxLength={1000}` + live counter "{n}/1000".
  - Footer: "Save reflection" primary button (disabled while pending or empty), "Skip" link-style button.
  - On save → `addReflectionMutation.mutate({ lesson_progress_id, prompt, response, cycle_id: cycle?.id ?? undefined })`. If `cycle?.id` is undefined, omit field so DB stores null. On success → toast "Reflection saved" + close.
  - Skip just closes; nothing persisted.
- **No edits** to `upsertProgress`, `autoCompleteLesson`, VimeoPlayer JSX, or any existing query/mutation.

### 3. New file `src/components/academy/pdp/QuickReflectionDrawer.tsx`
Self-contained drawer component (keeps the page file lean). Strict typed props:
```ts
interface QuickReflectionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonProgressId: number | null;
  cycleId: number | null;
  lessonTitle?: string | null;
}
```
Uses `useAddReflection(cycleId)` internally.

### 4. `src/pages/academy/pdp/index.tsx` (edit)
- Import `useUnattachedReflections`.
- Call `const { data: unattached } = useUnattachedReflections(userId);`
- When `unattached?.count && unattached.count > 0`, render a small `Badge` (variant outline / amber accent) near the page subtitle / header band: e.g. `"{n} unattached reflection(s)"` with a tooltip "Created from lesson completions outside an active cycle".
- Purely visual; no behavior change.

## Edge Cases / Conflicts Considered
- **Acting user vs auth user**: Page supports impersonation via `useAcademyActingUserId`. Reflection is tied to the real `auth.uid()` per spec — correct, since RLS on `pdp_reflections` will be enforced for that user. We will not write a reflection if the acting user differs from auth user (prevents cross-user reflections). Add a guard: only open drawer when `actingUserId === authUserId`.
- **Already-completed lessons on mount**: snapshot `completedLessonIds` on first load per `lesson.id` and skip — avoids prompting users revisiting a finished lesson.
- **Preview / read-only / unenrolled**: `autoCompleteLesson` is gated by `canTrackProgress`, so the trigger won't fire — no extra guard needed but we'll also early-return if `!canTrackProgress`.
- **Multiple invalidations**: We watch `completedLessonIds` which is already refreshed by `autoCompleteLesson`'s `qc.invalidateQueries`. No new invalidation churn.
- **Non-blocking**: shadcn `Drawer` rendered with `modal={false}` and no scroll lock — user can dismiss via X, Skip, or simply navigate away (drawer unmounts on route change).
- **No `any`**: drawer props strictly typed; mutation input typed via existing `AddReflectionInput`.
- **No DB migrations** required — schema already supports nullable `cycle_id` and `lesson_progress_id`.
- **RLS**: existing `pdp_reflections` policies (insert where `user_id = auth.uid()`) will accept the row; cycle_id null is allowed by the schema.

## Risk Assessment
| Area | Risk | Mitigation |
|---|---|---|
| Lesson completion logic | None — not touched | Verified `autoCompleteLesson` and `upsertProgress` unchanged |
| VimeoPlayer | None — props unchanged | Reflection trigger is a separate effect on query state |
| Query cache | Low — only adds invalidation key | New key namespaced under `["pdp","unattached-reflections"]` |
| RLS / security | Low | Reuses existing `addReflection` API which stamps `auth.uid()` server-side check |
| User confusion | Low | Drawer optional, dismissible, non-modal |
| Impersonation | Low | Guarded so reflection only prompts for real user |

## Summary of Changes
1. **Edit** `src/features/pdp/hooks.ts` — add `useUnattachedReflections`, extend `useAddReflection` invalidations.
2. **Edit** `src/pages/client/AcademyLessonViewerPage.tsx` — additive completion-watch effect + drawer render. No existing logic touched.
3. **New** `src/components/academy/pdp/QuickReflectionDrawer.tsx` — typed shadcn Drawer component.
4. **Edit** `src/pages/academy/pdp/index.tsx` — unattached reflections badge.

## Benefits
- Captures reflective learning at peak relevance (immediately after completion).
- Zero impact on existing progress/completion flow — fully additive and reversible.
- Surfaces orphan reflections so users can reattach them later when a cycle exists.
- Strict typing, no DB changes, no RLS changes.
