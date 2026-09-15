# Audit: 2026-09-15 — Two more instances of the dead `profile.state` account-status check, and root-cause type fix

**Trigger:** Carl asked directly why the dead `profile.state === "inactive"` check existed in the first place, and asked for a fix that prevents the same mistake recurring — prompted an exhaustive repo-wide grep rather than trusting the two occurrences already fixed in `docs/audit-log/entries/2026-09-15-fix-verify-auth-dead-account-status-check.md` were the only ones.
**Scope:** `supabase/functions/_shared/requireCaller.ts`'s `requireSuperAdmin()`, `supabase/functions/backfill-vimeo-durations/index.ts`, plus a type correction in `supabase/functions/_shared/auth-helpers.ts`'s `UserProfile` interface.

## Root cause

`public.users.state` is `bigint` (confirmed via `information_schema.columns`), almost certainly an Australian state/territory reference — it has nothing to do with account status. At some point `verifyAuth` (`auth-helpers.ts`) was written comparing `profile.state` to the strings `'inactive'`/`'suspended'`, evidently under a mistaken assumption about what the column held. That pattern was then copied into three more places by different authors/sessions, each presumably trusting the existing code as a correct precedent to replicate rather than verifying it actually worked:

1. `auth-helpers.ts`'s `verifyAuth` (fixed this morning, see the linked sibling entry)
2. `ask-viv-access.ts`'s `validateClientAskVivAccess` (fixed this morning, same entry)
3. `requireCaller.ts`'s `requireSuperAdmin` — **found and fixed in this entry**
4. `backfill-vimeo-durations/index.ts` — **found and fixed in this entry**

The mistake was able to spread and go undetected because:
- `UserProfile.state` was hand-declared as `string | null` in the shared interface — not generated from the live schema — so the comparison looked like valid, ordinary TypeScript to every reader and every author who copied it.
- Deno Edge Functions have **zero local or CI type-checking** in this repo (`supabase/functions/**` isn't covered by `npm run typecheck`, and the Deno CLI isn't installed locally) — even if the interface had been correctly typed, nothing would have run that check against these files to catch a still-existing mismatch before deploy.

## Severity of the newly found instances

`requireCaller.ts`'s `requireSuperAdmin()` is a **shared, widely-used gate** (distinct from `requireCaller`'s `check_permission`-based path) — any Edge Function calling it for its most sensitive actions had this same disabled-account gap: with the dead `state` check contributing nothing, `requireSuperAdmin`'s effective condition was just `profile.unicorn_role !== SUPER_ADMIN_ROLE`, with no disabled/archived exclusion at all. `backfill-vimeo-durations` has the identical pattern inline, gating its own Super-Admin-only action the same way.

## Code changes (this entry accompanies them)

- `requireCaller.ts`'s `requireSuperAdmin()`: now selects `unicorn_role, disabled, archived` (was `unicorn_role, state`) and checks `profile.disabled || profile.archived` instead of the dead `state` comparison.
- `backfill-vimeo-durations/index.ts`: identical fix, same shape.
- `auth-helpers.ts`'s `UserProfile.state` type corrected from `string | null` to `number | null`, with a comment explaining what it actually is and pointing at this finding — so a future attempt to write `state === "inactive"` again would at least be visibly wrong to anyone using an editor with Deno language support, even without CI enforcement.

## Decisions

- Fixed both newly found instances immediately, same severity reasoning as this morning's fixes.
- Did **not** build Deno CI type-checking in this entry — that's the real structural fix for this class of bug recurring with a *different* field one day, but it's a larger infrastructure project (getting the Deno CLI into CI, wiring a typecheck job scoped to `supabase/functions/**`) outside this bounded fix's scope. Flagged as the honest, most valuable follow-up below.
- Did not attempt a broader "any hand-typed interface might be wrong somewhere" audit — this entry is scoped to the one confirmed-wrong field (`state`) and its exact copy-paste spread, found via an exhaustive grep for the literal comparison pattern, not a general interface audit.

## Verification

- Exhaustive grep (`state === "inactive"` / `state === "suspended"`, both quote styles) across all of `supabase/functions/**/*.ts` confirms exactly these 4 occurrences existed in total, all now fixed (2 this morning, 2 in this entry).
- Confirmed no other code path reads `profile.state` expecting a string (grepped every function consuming `UserProfile` after the type correction) — the type change from `string | null` to `number | null` has no other call site to break.
- `npm run test:edge`: 315/315 pass after this change.

## Open questions parked

- **Deno CI type-checking for `supabase/functions/**`** is the real structural prevention for a similar mistake with a different field — not built here, recommended as a follow-up.
- Whether other hand-typed interfaces across the Edge Function shared files have a similar schema-mismatch — not swept; this entry is scoped to the one confirmed field.
