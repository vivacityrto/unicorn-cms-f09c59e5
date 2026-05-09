# Block writes in preview mode + graceful DB errors

## Root cause

**Bug 1 — write leak.** `useEnrolCourse` (`src/hooks/academy/useEnrolCourse.ts`) checks `isImpersonating` only to choose between two RPCs (`enrol_as_impersonator` vs `enrol_in_academy_course`); both still execute. There is no global guard that turns the "Read-only preview mode" banner into an actual write block. Other client-surface mutations (`AcademyLessonViewerPage.markComplete`, `AcademyAssessmentPlayerPage.submitMutation`, `AcademyCourseDetailPage` callsites) have the same gap.

**Bug 2 — raw DB error in UI.** Mutation hooks pipe `e.message` straight into `toast.error` (e.g. `useEnrolCourse` line 42), so Postgres FK violation text reaches the user verbatim.

## Fix

### 1. Add `useReadOnlyGuard()` hook
New file `src/hooks/useReadOnlyGuard.ts`:
- Returns a function `guard(actionLabel?: string) => boolean`.
- Reads `isPreviewMode` from `useClientPreview()`.
- If preview is active: shows `toast("Actions are disabled in preview mode.")` (sonner) and returns `true` (caller treats as blocked).
- Otherwise returns `false`.
- Single source of truth — every write site calls it before doing work.

### 2. Add `friendlyDbError()` helper
New file `src/lib/friendlyDbError.ts`:
- Signature: `friendlyDbError(err: unknown, context: string): string`.
- Always returns the same user-facing string: `"This action couldn't be completed. Please contact support if this continues."`
- Logs the original error with `console.error(`[${context}]`, err)` so the technical detail is preserved.
- (Future hook for Sentry/error tracker can be added in one place.)

### 3. Wire guard + friendly error into write sites

**Primary (reported bug):**
- `src/hooks/academy/useEnrolCourse.ts` — call `guard("Enrol")` at top of `mutationFn`; if blocked, throw a sentinel that `onError` swallows (no extra toast). Replace `e.message` in `onError` with `friendlyDbError(e, "useEnrolCourse")`.

**Sibling academy client mutations** (same `/academy/*` surface, same risk):
- `src/hooks/academy/useCompleteEnrollment.ts` — guard + friendly error.
- `src/pages/client/AcademyLessonViewerPage.tsx` — guard at `markComplete.mutationFn` and at the inline `upsert` calls in lines 188 / 210 (auto-progress also writes).
- `src/pages/client/AcademyAssessmentPlayerPage.tsx` — guard at `submitMutation.mutationFn`; friendly error in `onError`.

**Compliance surface:** `/compliance/*` resolves to `ComplianceManagerPage` (an Academy pathway) plus the client compliance widgets. A grep of `src/pages/client/ComplianceManagerPage.tsx` and `src/components/client/` shows no client-initiated INSERT/UPDATE/DELETE on the compliance pathway today (reads + acknowledgements are handled server-side via tasks). No additional wiring needed; the guard hook is in place if a future write button lands there.

**Out of scope:** SuperAdmin-only Academy admin pages (`/academy/admin/*` builder, rules, enrolments) — these are reached only by staff with `canUsePreview`, but staff should not enter preview mode while editing the builder. The guard is harmless there if added later, but per ticket scope we touch only client-facing surfaces.

### 4. Sentinel pattern
Inside guarded `mutationFn`:
```ts
if (guard("Enrol")) throw new Error("__PREVIEW_BLOCKED__");
```
`onError` checks `if (e.message === "__PREVIEW_BLOCKED__") return;` so the toast from the guard isn't double-stacked with a friendly-error toast.

## Verification

1. **Impersonation ON, /academy/trainer → Enrol Now** → toast "Actions are disabled in preview mode.", network tab shows no `enrol_as_impersonator` call.
2. **Impersonation ON, lesson "Mark complete" / assessment submit** → same toast, no write.
3. **Impersonation OFF, real client user, Enrol Now** → enrols normally, success toast.
4. **Force FK error (impersonation OFF, simulate by enrolling against an orphaned `users` row via a test account)** → toast "This action couldn't be completed. Please contact support if this continues.", original Postgres error visible in console only.

## Files

New:
- `src/hooks/useReadOnlyGuard.ts`
- `src/lib/friendlyDbError.ts`

Edited:
- `src/hooks/academy/useEnrolCourse.ts`
- `src/hooks/academy/useCompleteEnrollment.ts`
- `src/pages/client/AcademyLessonViewerPage.tsx`
- `src/pages/client/AcademyAssessmentPlayerPage.tsx`

No backend, no migrations, no RLS changes. The deeper `public.users` ↔ `auth.users` integrity issue stays in its separate ticket.
