# Phase 6 — True-Zero Lint Packet

> **Parent plan:** [Codebase Optimization and KB Renewal Plan](../../codebase-optimization-plan-2026-08-28.md)
>
> **Program index:** [Program Index](../../program-index.md)
>
> **Status:** planning — inventory recorded, no fix batch shipped yet
>
> **Owner:** Carl authorizes each batch, Claude Code executes
>
> **Scope:** drive `npm run lint` from 0 errors/44 warnings to 0 errors/0 warnings — no rule suppression, no severity downgrade, no unrelated behavior change
>
> **Dependencies:** none (pure frontend module-boundary/typing cleanup); must not be mixed into Phase 4/5 behavior-changing packets
>
> **Exit criteria:** `npm run lint` reports 0 errors, 0 warnings; `docs/kb/reference/lint-baseline.json` regenerated to match
>
> **Evidence:** this doc's own inventory (verified live 2026-09-10) plus each batch's own PR
>
> **Audit entry:** none needed — frontend-only module reorganization, no schema/RLS/trigger/security/cron/production-data change

## Purpose and non-goals

Carl wants zero warnings, not just zero errors — a documented residual-warning
posture (see the Phase 2.6 plan's own `AGENTS.md` lint note) is no longer the
target. This packet inventories the live warning population and defines
bounded, behavior-preserving batches to close it out.

**In scope:** moving non-component exports (constants, types, helper
functions, consumer hooks) out of files that also export React components, so
each file exports only components (satisfies `react-refresh/only-export-components`);
deleting four confirmed-stale `eslint-disable` comments.

**Out of scope:** global `eslint --fix`, disabling/downgrading the
`react-refresh/only-export-components` rule, any change to component
behavior, props, or rendering output, and any Phase 4/5 hotspot or Edge
Function work that happens to touch the same files for unrelated reasons —
coordinate rather than bundle if that overlap arises.

## Current inventory (verified live, 2026-09-10)

`npm run lint` → **0 errors, 44 warnings**. Two categories:

### Category 1 — 4 stale `eslint-disable-next-line` directives

ESLint itself reports each as "no problems were reported" for the disabled
rule at that line — the disable comment is dead weight, not masking a real
issue. Deleting the comment line is safe by construction (0 errors before and
after, since the underlying rule doesn't fire there regardless).

| File | Line | Disabled rule |
| --- | --- | --- |
| `src/components/audit/workspace/useDebouncedAutosave.ts` | 60 | `react-hooks/exhaustive-deps` |
| `src/features/pdp/workforce.ts` | 56 | `no-console` |
| `src/hooks/usePageViewTracking.ts` | 54 | `react-hooks/exhaustive-deps` |
| `src/lib/friendlyDbError.ts` | 11 | `no-console` |

### Category 2 — 40 `react-refresh/only-export-components` warnings, 29 files

Vite's React Fast Refresh needs a file to export *only* components to
preserve component state across hot-reloads in dev; exporting a constant,
type, or hook alongside a component breaks that guarantee. This is a
dev-experience concern, not a correctness one — no production behavior
changes when it fires — but it's real work to close out properly.

| File | Non-component exports to relocate |
| --- | --- |
| `components/academy/VimeoPlayer.tsx` | 1 helper/const |
| `components/academy/WorkshopSegmentSplit.tsx` | 3 helpers/consts |
| `components/audit/DeleteAuditDialog.tsx` | 1 |
| `components/audit/workspace/QuestionGuidance.tsx` | 1 |
| `components/audit/workspace/UnsavedAuditWorkContext.tsx` | 1 (context consumer hook) |
| `components/client/ClientTimelineTab.tsx` | 1 |
| `components/client/ScopeSelectorBadge.tsx` | 2 (same line, two named exports) |
| `components/client/TimelineEventCard.tsx` | `EVENT_ICON_MAP`, `EVENT_COLOR_MAP` |
| `components/help-center/HelpCenterContext.tsx` | 1 (context consumer hook) |
| `components/layout/ClientLayout.tsx` | `useOpenDocumentRequest` hook |
| `components/package-builder/PackageReadinessIndicator.tsx` | 1 |
| `components/stage/StageFrameworkSelector.tsx` | 6: `FRAMEWORK_OPTIONS`, `FrameworkValue`, `formatFrameworks`, `getFrameworkColor`, `updateStageFrameworks`, `isFrameworksNarrowed`, `checkFrameworkCompatibility` |
| `components/tenant/RenameTenantDialog.tsx` | 1 |
| `components/ui/badge.tsx` | `badgeVariants` (cva) |
| `components/ui/button.tsx` | `buttonVariants` (cva) |
| `components/ui/celebration.tsx` | 1 |
| `components/ui/form.tsx` | 1 (form field hook) |
| `components/ui/responsive-table.tsx` | 1 |
| `components/ui/sonner.tsx` | 1 |
| `components/ui/text.tsx` | 1 |
| `components/ui/toggle.tsx` | `toggleVariants` (cva) |
| `contexts/ClientPreviewContext.tsx` | 1 (context consumer hook) |
| `contexts/ClientTenantContext.tsx` | 1 (context consumer hook) |
| `contexts/PageTitleContext.tsx` | `usePageTitle`, `usePageTitleValue` |
| `contexts/TenantTypeContext.tsx` | 1 (context consumer hook) |
| `contexts/ViewModeContext.tsx` | 1 (context consumer hook) |
| `features/pdp/components/StandardsPicker.tsx` | 1 |
| `hooks/useAuth.tsx` | `useAuth` hook (alongside `AuthProvider`) |
| `routes/dashboardRoutes.tsx` | `LegacyAuditTabRedirect`, `LegacyTenantDocumentsRedirect` (inline local components in a route-config file; different message variant, "move to a separate file") |

**Known stale baselines to correct in the same reconciliation pass:** the
committed `docs/kb/reference/lint-baseline.json` still reports 2 errors/40
rule-attributed warnings from a 2026-09-07 generation — regenerate it after
the fix batches land, not before. The Phase 2.6 plan's own text says "39
Fast Refresh warnings"; the live count is 40 (plus the 4 rule-less stale
disables) — correct that count as part of this packet's own documentation
reconciliation, cross-linking back to the Phase 2.6 P5-A residual-warning
note.

## Fix patterns

- **shadcn `cva` variants** (`button`, `badge`, `toggle`): move `buttonVariants`/`badgeVariants`/`toggleVariants` into a sibling `*-variants.ts`, re-export, update the few call sites that import the variants function directly (most consumers only use `<Button variant="...">` and never import the function).
- **Context/provider files** (11 files: `useAuth.tsx`, `ClientLayout.tsx`, `ClientTenantContext.tsx`, `ClientPreviewContext.tsx`, `TenantTypeContext.tsx`, `ViewModeContext.tsx`, `HelpCenterContext.tsx`, `UnsavedAuditWorkContext.tsx`, `PageTitleContext.tsx`): move the `useX()` consumer hook into a sibling `use-x.ts`, re-export, update every import site.
- **Constant maps** (`TimelineEventCard.tsx`): move `EVENT_ICON_MAP`/`EVENT_COLOR_MAP` into a sibling `timeline-event-maps.ts`.
- **`StageFrameworkSelector.tsx`** (heaviest single file, 6 warnings): split into `stage-framework-selector.tsx` (components only) + `stage-framework-utils.ts` (the 6 non-component exports) — verify every call site of each utility before moving.
- **`dashboardRoutes.tsx`**: pull `LegacyAuditTabRedirect`/`LegacyTenantDocumentsRedirect` into `src/routes/legacy-redirects.tsx`, import into the route table.
- **Stale disables**: delete the comment line, nothing else.

## Batch plan

Per this repo's own batching convention (`AGENTS.md`: 5-10 files or 15-40
findings sharing a feature area/contract per PR), split into 5 batches by
area rather than one 40-finding PR:

1. **Stale disables** (4 files) — trivial, no import/call-site impact, compiler/lint proof only, no Playwright needed.
2. **shadcn UI primitives** (8 files: `badge`, `button`, `toggle`, `form`, `sonner`, `text`, `celebration`, `responsive-table`) — widely imported; run the full frontend test suite, no behavior change expected, low-risk scoped Playwright smoke on a couple of representative pages using each primitive.
3. **Context/provider files** (9 files, including `useAuth.tsx`) — higher risk tier; `useAuth.tsx` in particular gates the whole app, so this batch gets a real authenticated Playwright pass (login, protected route, sign-out), not just a smoke check.
4. **Feature-area components** (6 files: `ClientTimelineTab`, `ScopeSelectorBadge`, `TimelineEventCard`, `StageFrameworkSelector`, `RenameTenantDialog`, `PackageReadinessIndicator`) — scoped Playwright on the affected pages only.
5. **Remainder** (6 files: `DeleteAuditDialog`, `QuestionGuidance`, `VimeoPlayer`, `WorkshopSegmentSplit`, `StandardsPicker`, `dashboardRoutes.tsx`) — scoped Playwright on affected pages; `dashboardRoutes.tsx` change is route-table-only, verify no route/guard regression via the route manifest diff (`npm run routes`).

Every batch: full `lint:ratchet`/`typecheck`/`test:frontend`/`test:edge`/`build`
chain, since these are compiler-provable-safe moves per file but the batch as
a whole still gets the full chain per this repo's standing verification
contract. Regenerate `lint-baseline.json` once, after the last batch lands,
not per batch.

## Definition of done

- `npm run lint` reports 0 errors, 0 warnings.
- `docs/kb/reference/lint-baseline.json` regenerated and matches.
- The Phase 2.6 plan's stale "39 Fast Refresh warnings" note corrected.
- No component behavior, prop, or rendering change in any batch — verified by the full chain plus scoped Playwright per the risk tier above.
