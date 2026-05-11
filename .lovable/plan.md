## Goal
Add a **PDP (Personal Development Plan)** feature scaffold under `src/features/pdp/` with typed API + React Query hooks, and link it from the Academy sidebar nav. No UI/page work in this pass.

## Step 1 — Supabase types

Verified the generated types file (`src/integrations/supabase/types.ts`) already contains all six tables (`pdp_audiences`, `pdp_cycles`, `pdp_goals`, `pdp_evidence_items`, `pdp_reflections`, `pdp_reviews`) and both views (`v_pdp_cycle_summary`, `v_pdp_user_currency`). No regeneration needed — the types are already current. (I'll note this in the implementation, no migration will be run.)

## Step 2 — Create `src/features/pdp/types.ts`

Re-export row types from the generated `Database` type:

```ts
import type { Database } from "@/integrations/supabase/types";

export type PdpAudience      = Database["public"]["Tables"]["pdp_audiences"]["Row"];
export type PdpCycle         = Database["public"]["Tables"]["pdp_cycles"]["Row"];
export type PdpGoal          = Database["public"]["Tables"]["pdp_goals"]["Row"];
export type PdpEvidenceItem  = Database["public"]["Tables"]["pdp_evidence_items"]["Row"];
export type PdpReflection    = Database["public"]["Tables"]["pdp_reflections"]["Row"];
export type PdpReview        = Database["public"]["Tables"]["pdp_reviews"]["Row"];
export type PdpCycleSummary  = Database["public"]["Views"]["v_pdp_cycle_summary"]["Row"];
export type PdpUserCurrency  = Database["public"]["Views"]["v_pdp_user_currency"]["Row"];

export type PdpCycleStatus   = 'planning' | 'active' | 'under_review' | 'completed';
export type PdpGoalStatus    = 'open' | 'in_progress' | 'met' | 'not_met' | 'deferred';
export type PdpEvidenceType  = 'academy_completion' | 'academy_certificate' | 'external_course'
  | 'workshop' | 'industry_placement' | 'validation_activity' | 'community_of_practice'
  | 'conference' | 'mentoring' | 'reading' | 'audit_response' | 'other';
export type PdpReviewType    = 'mid_cycle' | 'end_cycle' | 'ad_hoc';
export type PdpReviewOutcome = 'on_track' | 'needs_action' | 'completed' | 'not_completed';
export type CurrencyStatus   = 'current' | 'on_track' | 'at_risk' | 'overdue';
```

## Step 3 — Create `src/features/pdp/api.ts`

Typed helpers using `@/integrations/supabase/client`. Strict TypeScript, no `any`. Each helper throws on Supabase error and returns parsed data. Function signatures exactly per spec:

- `listAudiences()` → `PdpAudience[]`
- `getCurrentCycle(userId, tenantId)` → most recent cycle filtered by `user_id` + `tenant_id` (handle null), ordered by `cycle_start_date desc`, `.maybeSingle()` → `PdpCycle | null`
- `getCycleSummary(cycleId)` → single row from `v_pdp_cycle_summary` → `PdpCycleSummary | null`
- `listGoals(cycleId)` / `listEvidence(cycleId)` / `listReflections(cycleId)` / `listReviews(cycleId)` — filtered by `cycle_id`, ordered chronologically
- `createCycle(input)` — `Pick<PdpCycle, 'user_id'|'tenant_id'|'audience_code'|'cycle_year'|'cycle_start_date'|'cycle_end_date'|'target_pd_hours'>` → inserts and returns the new row
- `upsertGoal(input)` — `Partial<PdpGoal> & { cycle_id; title }`; uses `upsert` keyed on `id` when present, insert otherwise
- `logEvidence(input)` — `Partial<PdpEvidenceItem> & { cycle_id; evidence_type; title; occurred_on }`; insert
- `addReflection(input)` — insert with the supplied optional foreign keys + `response`
- `signOffReview(reviewId)` — `update pdp_reviews set signed_off_at = now(), signed_off_by = (auth user id resolved client-side via supabase.auth.getUser()) where id = reviewId`

`created_at` / `updated_at` are omitted from inserts per project standard.

## Step 4 — Create `src/features/pdp/hooks.ts`

React Query hooks following the pattern in `src/hooks/academy/` (typed `queryKey`, `useQuery`/`useMutation`, error toasts via `sonner`):

- `useAudiences()`
- `useCurrentCycle(userId, tenantId)` — disabled until `userId` present
- `useCycleSummary(cycleId)`
- `useGoals(cycleId)`, `useEvidence(cycleId)`, `useReflections(cycleId)`, `useReviews(cycleId)` — all `enabled: !!cycleId`
- Mutations: `useCreateCycle`, `useUpsertGoal`, `useLogEvidence`, `useAddReflection`, `useSignOffReview` — invalidate the relevant list/summary keys on success and `toast.error` on failure.

Query key shape: `['pdp', 'goals', cycleId]` etc., to make invalidation simple.

## Step 5 — Sidebar nav

Edit `src/config/navigationConfig.ts` only. In `academyMenuSections` → `key: "main"` items array, **append** one entry after `Community`:

```ts
{ icon: Target, label: "My PDP", path: "/academy/pdp" },
```

(`Target` from `lucide-react` — added to the existing import block.) No other nav items touched. The Academy nav already drives its own active styling; the Acai (#44235F) active colour is inherited from the existing Academy nav item rendering — no style changes are needed in the config file (it's data only). If the active colour differs from #44235F in practice, that's a renderer concern, out of scope per spec ("Do not touch any existing Academy components").

## Out of scope (explicit)

- No new pages, route registrations in `App.tsx`, or UI components.
- No edits to existing Academy hooks/components/pages.
- No DB migrations (types verified current).
- No changes to `src/integrations/supabase/types.ts` (auto-generated).

## Verification

- `bunx tsc --noEmit` clean.
- New files compile against the existing generated `Database` type.
- Sidebar shows "My PDP" under Academy (route resolves to a 404 until a page is added — expected).
