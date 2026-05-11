# Manager Reviews Hub + Composer Drawer + Acknowledge

## Context Verified
- `pdp_reviews` schema: `cycle_id`, `review_type` (text), `reviewer_id` (NOT NULL uuid), `review_date` (NOT NULL date), `notes`, `outcome`, `signed_off_at`, `signed_off_by`. **No `created_by` / `updated_at`** — single `created_at`.
- `pdp_cycles` has `manager_id`. RLS `pdp_cycles: manager views assigned` already grants managers SELECT on rows where `manager_id = auth.uid()`.
- `pdp_reviews` RLS `reviewer manages own` already grants reviewer full access where `reviewer_id = auth.uid()` — no migration needed.
- Sign-off API already exists (`signOffReview` + `useSignOffReview`). Reviewee `Sign off` button already renders for `end_cycle` pending in `ReviewsTab.tsx` — will rename copy to "Acknowledge" per prompt and let it cover all review types (not just end-of-cycle) when reviewee is current user.
- Route registry lives in `src/App.tsx` with lazy imports for `/academy/pdp` and `/academy/pdp/cycle/:cycleId`.
- No existing project-wide markdown editor — will use `Textarea` + "Markdown supported" hint to stay consistent with reflections/notes UX. Saved notes already render with `whitespace-pre-wrap` in `ReviewsTab`.

## Files

### 1. `src/features/pdp/api.ts` (edit) — add manager queries + create review
- `listManagerCycles(managerId)` → `pdp_cycles.select("*, user:users!user_id(user_uuid, first_name, last_name, email)").eq("manager_id", managerId).order("cycle_end_date", { ascending: true })`. Returns rows with embedded reviewee profile (graceful if FK alias differs — fall back to manual join).
- `listManagerEndCycleReviews(cycleIds)` → `pdp_reviews.select("cycle_id").in("cycle_id", cycleIds).eq("review_type","end_cycle")` — used to detect "no end-cycle review yet" for the **Awaiting review** group.
- `createReview(input)`:
  - input: `{ cycle_id, review_type: 'mid_cycle'|'end_cycle'|'ad_hoc', notes?: string|null, outcome?: 'on_track'|'needs_action'|'completed'|'not_completed'|null, review_date?: string }`
  - resolves `reviewer_id` from `auth.getUser()`; defaults `review_date` to today (`yyyy-MM-dd`).
  - returns inserted row.

### 2. `src/features/pdp/hooks.ts` (edit) — add manager hooks
- `useManagerCycles(managerId)` — query key `["pdp","manager-cycles", managerId]`. Returns `ManagerCycle[]` typed with reviewee profile fields.
- `useManagerEndCycleReviewMap(cycleIds)` — query key `["pdp","manager-end-cycle-reviews", sortedIds]`. Returns `Set<number>` of cycle ids with an end-cycle review. Disabled if `cycleIds.length === 0`.
- `useCreateReview(cycleId)` — mutation that invalidates `["pdp","reviews", cycleId]`, `["pdp","cycle-summary", cycleId]`, and `["pdp","manager-cycles"]` / `["pdp","manager-end-cycle-reviews"]` so the hub refreshes.

### 3. `src/components/academy/pdp/ReviewComposerDrawer.tsx` (new)
Self-contained shadcn `Sheet` (right on desktop, bottom on mobile via `useIsMobile`). Strict-typed props:
```ts
interface ReviewComposerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  revieweeName?: string | null;
}
```
Form (controlled state, no zod for this prompt — light validation):
- **Review type**: shadcn `RadioGroup` (Mid cycle / End cycle / Ad hoc).
- **Notes**: `Textarea` rows={8}, `maxLength={4000}`, hint "Markdown supported".
- **Outcome**: shadcn `Select` (`__none__` ↔ null per project standard) — On track / Needs action / Completed / Not completed.
- Footer: "Save review" (disabled while pending), "Cancel".
- On save → `useCreateReview(cycleId).mutate(...)`; on success toast "Review saved" and `onOpenChange(false)`.

### 4. `src/pages/academy/pdp/cycle/[cycleId].tsx` (edit, additive)
- Read `?reviewMode=1` via `useSearchParams`.
- Compute `isManager = !!user && cycle?.manager_id === user.id`.
- New state `composerOpen`, seeded `true` when `reviewMode === '1' && isManager` (one-shot via `useEffect` keyed on `reviewMode + cycle?.manager_id`).
- Render `<ReviewComposerDrawer />`. Strip `reviewMode` from URL on close (`setSearchParams` without the key) so refresh doesn't reopen.
- If `reviewMode=1` but `!isManager`, show inline `Alert` ("You are not the assigned manager for this cycle.") instead of opening drawer.
- **No edits** to existing tabs / layout.

### 5. `src/components/academy/pdp/cycle/ReviewsTab.tsx` (edit, copy + scope only)
- Change "Sign off" button label → "Acknowledge" when reviewee is the current auth user.
- Show the Acknowledge button for any `pdp_reviews` row where `signed_off_at == null` AND `cycle.user_id === auth.uid()` (reviewee). Currently restricted to `end_cycle`; broaden so reviewee can acknowledge mid-cycle / ad-hoc reviews too (matches "the reviewee can sign off the review" requirement). Pass `cycle` (or just `revieweeUserId`) into ReviewsTab; call site already has `cycle` available.
- Keep existing `useSignOffReview` flow intact.
- Display a small in-app banner above the list when there is at least one review created in the last 24h that is unsigned and reviewee = current user: "New manager review awaiting your acknowledgement." (Pure UI — satisfies the "in-app banner is sufficient" requirement until Edge Function from Prompt 10 lands.)

### 6. `src/pages/academy/pdp/reviews.tsx` (new) — Manager Reviews Hub
- Layout: `AcademyLayout` + `AcademyPageWrapper` (title "Reviews", subtitle "Cycles assigned to you for review").
- `useAuth()` → managerId; `useManagerCycles(managerId)`; `useManagerEndCycleReviewMap(cycleIds)`.
- Group cycles client-side using `date-fns`:
  - **Awaiting review**: `status === 'under_review'` OR (`cycle_end_date < today` AND id NOT in end-cycle review set AND status !== 'completed').
  - **Active**: `status === 'active'` (and not already in Awaiting bucket).
  - **Recently closed**: `status === 'completed'` AND `completed_at >= today - 90d` (fall back to `cycle_end_date` if `completed_at` null).
- Render three `Card` sections; each row shows reviewee name, audience code badge, cycle dates, status badge, and a clickable `Link` to `/academy/pdp/cycle/{id}?reviewMode=1`. Whole row is a clickable button; hover affordance. Empty state per group ("Nothing here yet").
- Skeletons during initial load. Sign-in / no-data states handled.

### 7. `src/App.tsx` (edit) — register route
- `const AcademyPdpReviewsPage = lazy(() => import("./pages/academy/pdp/reviews"));`
- `<Route path="/academy/pdp/reviews" element={<ProtectedRoute><AcademyPdpReviewsPage /></ProtectedRoute>} />`
- Place above the `/academy/pdp/cycle/:cycleId` route to avoid any path matching ambiguity.

## Edge Cases / Conflicts Considered
- **RLS**: All writes are by manager (reviewer); existing `pdp_reviews: reviewer manages own` policy permits insert/select. Sign-off path uses existing reviewee policy. No migration.
- **Audit/notification**: Per prompt, an Edge Function will be wired in Prompt 10. We render an in-app banner today and leave a `// TODO(prompt-10): notify reviewee via edge function` comment in `useCreateReview` `onSuccess`.
- **`pdp_reviews` schema gotchas**: `reviewer_id` and `review_date` are NOT NULL — defaults supplied. No `updated_at` column — do not attempt to set it.
- **Routing precedence**: `/academy/pdp/reviews` registered before `:cycleId` route to avoid future regressions if patterns change.
- **`reviewMode=1` on non-managers**: Drawer never opens; user sees inline message — prevents confused UX while preserving deep linking semantics.
- **Date filtering**: All boundaries computed in local time using `startOfToday()` and `subDays(today, 90)` from `date-fns`.
- **No `any`** in new code; reuse `PdpCycle`, `PdpReview` types and add `ManagerCycle = PdpCycle & { user: { user_uuid; first_name; last_name; email } | null }`.
- **Australian date format** `dd/MM/yyyy` per memory.
- **Existing `ReviewsTab` label change** is backwards compatible for sign-off semantics — same RPC, same RLS.

## Risk Assessment
| Area | Risk | Mitigation |
|---|---|---|
| RLS / data leak | None — manager filter enforced both client- and DB-side | Existing policies unchanged |
| Sign-off broadening | Low — moves from end_cycle-only to all reviewee rows | Matches prompt; reviewee already had RLS update access |
| URL `reviewMode` flag | Low | Stripped on close; ignored for non-managers |
| Notification gap | Documented | In-app banner placeholder + TODO for Prompt 10 |
| New route | None | Lazy-loaded, ProtectedRoute wrapper |
| Schema change | None — no migration |

## Summary of Changes
1. **New** `src/pages/academy/pdp/reviews.tsx` — three-group manager hub.
2. **New** `src/components/academy/pdp/ReviewComposerDrawer.tsx` — composer Sheet.
3. **Edit** `src/features/pdp/api.ts` — `listManagerCycles`, `listManagerEndCycleReviews`, `createReview`.
4. **Edit** `src/features/pdp/hooks.ts` — `useManagerCycles`, `useManagerEndCycleReviewMap`, `useCreateReview`.
5. **Edit** `src/pages/academy/pdp/cycle/[cycleId].tsx` — `?reviewMode=1` opens composer for the assigned manager.
6. **Edit** `src/components/academy/pdp/cycle/ReviewsTab.tsx` — broaden Acknowledge button + in-app banner.
7. **Edit** `src/App.tsx` — register `/academy/pdp/reviews`.

## Benefits
- Single hub for managers to triage cycle reviews.
- Deep link `?reviewMode=1` keeps composer state shareable.
- Reviewee acknowledgement covers all review types — closer to a complete loop ahead of the Edge Function.
- Zero database migration; rides on existing RLS.
