# Audit: 2026-09-25 — Vivacity Academy Solo/Team/Elite tiers + seat-limit bug fix

**Trigger:** ad-hoc (Carl asked to extend the Academy Solo MVP into three
named Vivacity Academy tiers — Solo/Team/Elite — matching the marketing
site's pricing, and flagged a real seat-limit bug he'd spotted live)
**Scope:** the live `academy_access_enabled`/`academy_max_users` entitlement
system (`manage_academy_solo_access`, `create_academy_solo_account`,
`metadata.academy_solo`) and the seat-limit check in `useSeatLimits.ts`. Did
**not** touch the dead `tenants.tenant_type` vertical-tier model
(`academy_solo`/`academy_team`/`academy_elite` as `tenant_type` values) that
`2026-08-27-remove-deprecated-academy-tier-model.md` confirmed has zero
production usage — that system's `SEAT_LIMITS`/`UPGRADE_PATHS` constants are
a coincidentally-named, unrelated mechanism and remain untouched. No Stripe/
billing integration — this is still MVP: tier assignment is manual, by
superadmin, same as the original Solo pilot.

## Findings

- **Real, live seat-limit bug, confirmed:** `checkSeatAvailability()`
  (`src/hooks/useSeatLimits.ts`) counted only `tenant_members` rows with
  `status='active'`. An outstanding, unaccepted `user_invitations` row for
  the same tenant was invisible to the count, so a Solo tenant with its
  single seat already consumed by one pending invite still reported
  "0 of 1 used" and let staff send a second invite past the cap. Fixed by
  counting active members **and** non-expired, non-revoked, unaccepted
  pending invitations together.
- While extending the tier model, found a **second latent bug the fix would
  have introduced**: `checkSeatAvailability`'s existing `tenant.academy_max_users
  ?? 1` fallback (written when "Academy mode" only ever meant the 1-seat
  Solo pilot) would have silently capped the new Elite tier at 1 seat, since
  `academy_max_users = NULL` now legitimately means "unlimited" for Elite,
  not "unset." Fixed by trusting `academy_max_users` as-is once a tenant is
  in Academy mode, rather than defaulting a `null` to 1.

## Code changes

Branch `claude/academy-customer-page-redesign-277208`.

- **Migration** `20260925061256_vivacity_academy_tiers.sql`: extends
  `manage_academy_solo_access` and `create_academy_solo_account` with a
  purely additive, defaulted trailing parameter (`p_academy_tier` /
  `p_tier`) — no existing call signature changes, no `DROP FUNCTION`
  needed. `academy_max_users` is now driven by tier: Solo=1, Team=10,
  Elite=`NULL` (unlimited). The metadata key stays `academy_solo` (all 4
  production tenants that have ever used it already carry that key) but now
  also carries a `tier` field. Backfilled all 4 existing Academy Solo
  tenants (`The Australian Higher Education Academy`, `Techskill Academy`,
  `Kingston State College`, `Rothwell Early Learning Centre Daycare`) to
  `tier='solo'` — verified via `execute_sql` post-migration, `academy_max_users`
  unchanged at 1 for all four.
- `src/lib/tenantAccountSurface.ts` — added `getAcademyTier()` (reads
  `metadata.academy_solo.tier`, defensively defaulting to `'solo'` for a
  stale/pre-migration client cache read) plus tier label/seat/price
  constants. `isAcademySoloTenant()` kept as-is (now means "is any Vivacity
  Academy tier," which is exactly its historical behaviour).
- `src/hooks/academy/useTenantAcademyAccess.ts` — `academy_solo: boolean` →
  `academy_tier: VivacityAcademyTier | null` end-to-end through
  `useUpdateTenantAccess`/`useCreateAcademySoloAccount`.
- `src/hooks/useSeatLimits.ts` — the two fixes above.
- `src/components/academy/admin/CreateAcademySoloDialog.tsx` renamed to
  `CreateVivacityAcademyDialog.tsx`, gains a tier picker (Solo $45/mo · Team
  $295/mo · Elite $495/mo pricing shown as reference only — no billing
  wired up).
- `src/pages/superadmin/AcademyTenantAccessPage.tsx` — "Academy Solo" badge/
  filter label → "Vivacity Academy · {Tier}"; nested per-tenant Academy-user
  list now defaults to expanded with an "Expand all / Collapse all" toggle
  (previously added this session, collapsed-by-default).
- `src/pages/superadmin/AcademyTenantDetail.tsx` — replaced the boolean
  "Academy Solo pilot" toggle with a tier `Select` (None/Solo/Team/Elite);
  restored a dedicated "Users" tab (full roster + resend/copy-link/revoke/
  reset-password controls, via the shared `AcademyTenantUsersPanel`)
  alongside the "Timeline" tab added earlier this session.

**Verification:**
- `npm run typecheck`, `npm run lint:ratchet` (+ direct `eslint` on new
  files), `npm run test:frontend`, `npm run test:edge` — all clean.
- Regenerated `src/integrations/supabase/types.ts` against the applied
  migration; confirmed both RPCs show as overloaded types (old signature
  preserved, new one with the tier param) rather than a breaking replace.
- Live Playwright/browser verification against the applied migration:
  tier `Select` persists and round-trips per tenant; nested list still
  renders real invited/active rows with correct status.

## Decisions

- Kept the metadata JSON key as `academy_solo` rather than renaming to
  `academy_tier` — a rename would have needed a data migration touching
  every consumer (`AcceptInvitation.tsx`'s own inline check, the RPC's
  `previous_max_users` restore logic) for a purely cosmetic win. Adding a
  `tier` field inside the existing object was lower-risk and just as
  readable.
- Extended both RPCs additively (new trailing optional param) instead of
  `DROP FUNCTION` + recreate with a renamed/reordered param, since the only
  caller is this repo's own `useTenantAcademyAccess.ts` — additive keeps
  the change reversible and avoids the brief window where the function
  doesn't exist.
- Did not touch the dead `tenant_type`-based `SEAT_LIMITS`/`UPGRADE_PATHS`
  constants in `useSeatLimits.ts` even though they contain the exact same
  tier names (`academy_team: 10`, `academy_elite: 30`) — confirmed via the
  2026-08-27 audit that mechanism has zero production users and is a
  different, already-deprecated system. Left a comment pointing at the
  actual live mechanism instead of consolidating the two, to avoid
  resurrecting dead code as a side effect of an unrelated feature.

## Open questions parked

- No Stripe/billing wiring yet, as directed — tier assignment stays a
  manual superadmin action. A future session would need to decide how a
  real subscription upgrade/downgrade should reconcile with this manual
  `academy_max_users`/`academy_solo.tier` state if/when billing lands.
- The pre-existing `academy_max_users` dual-meaning question (flagged
  2026-08-14, re-flagged 2026-08-27) is still open and unrelated to this
  change.
