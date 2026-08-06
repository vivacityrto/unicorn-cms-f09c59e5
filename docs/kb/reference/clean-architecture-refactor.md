# Clean Architecture Refactor — Proposal

> **Last updated:** 2026-04-27 · **Reconsider by:** 2026-07-27 · **Confidence:** medium — target shape and pilot scope are concrete; downstream slice list is provisional and will firm up after Slice 1 lands.
>
> A pragmatic, incremental refactor of `<codebase>/src/` toward Clean-Architecture-style layering, executed slice-by-slice via Lovable prompts. **Status: proposed, not yet started.** No Lovable prompt has been pasted; no codebase change has been made. This doc captures the plan so it survives the chat that produced it.

---

## TL;DR

- Codebase is large (≈1,295 files; 247 pages, 552 components, 238 hooks) but not architecturally broken — it has decent seams already.
- The pain that's worth fixing: Supabase calls leak into pages, role checks are scattered inline, Zod is installed but barely used, `useAuth` does too much, RLS is assumed silently.
- **Target shape** = three folder conventions (`domain/`, `data/`, existing `hooks/` + `pages/`) plus one ESLint rule that enforces the boundary.
- **Migration shape** = one vertical slice per Lovable prompt. Pilot slice: **Lifecycle Checklists**. No big-bang refactor.
- **Why pragmatic, not dogmatic:** Lovable's mental model is files-and-folders. A 4-ring ports-and-adapters scheme only sticks if it's expressible as folder conventions Lovable can imitate.

---

## Current state — where the pain is

Survey done 2026-04-27 against `<codebase>` HEAD `cf8d1314 Added risk rating UI`.

Stack: Vite + React 18 + Supabase + React Query + Zustand + React Hook Form + shadcn/ui + Zod (sparse).

Ranked by pain × tractability:

| # | Problem | Evidence | Fix shape |
|---|---------|----------|-----------|
| 1 | Supabase calls leak into pages | `<codebase>/src/pages/AcceptInvitation.tsx:56-58` calls `supabase.rpc(...)` inline; `src/services/` is one file | Establish `src/data/` repositories; pages/hooks never import `supabase` directly |
| 2 | Role checks scattered inline | `profile?.unicorn_role === "Admin"` shows up across components | Centralize in `src/domain/access/` with a `can(user, action, resource)` helper |
| 3 | Zod installed, barely used | Forms validate ad hoc; no schema layer | One Zod schema per entity in `src/domain/<entity>/schema.ts`; forms + repositories share it |
| 4 | Loose tsconfig | `noImplicitAny: false`, `strictNullChecks: false` | Tighten incrementally — flag-flip + fix-as-touched, not bulk-fix |
| 5 | `useAuth` does too much | Auth state + profile fetch + membership queries + setTimeout workaround at `<codebase>/src/hooks/useAuth.tsx:60` | Split: `useSession` (Supabase auth only) + `useProfile` (React Query) + `useMemberships` (React Query) |
| 6 | RLS assumed silently | No explicit error path for "RLS hid this row" | Repositories return typed errors; UI distinguishes "empty" from "forbidden" |

Out of scope (already fine, do not touch): routing, code-splitting, shadcn organization, the auto-generated `types.ts` monolith.

---

## Target shape

Additive folders, not destructive renames.

```
<codebase>/src/
├── domain/                  ← NEW. Pure TS. No React, no Supabase.
│   ├── <entity>/
│   │   ├── types.ts         ← domain types (not Supabase row types)
│   │   ├── schema.ts        ← Zod schema, single source of truth
│   │   └── rules.ts         ← pure functions (e.g. canEditChecklist)
│   └── access/
│       └── can.ts           ← RBAC helper
├── data/                    ← NEW. Wraps Supabase. Returns domain types.
│   └── <entity>/
│       └── repository.ts    ← exports get/list/create/update fns
├── hooks/                   ← EXISTING. React Query hooks call repositories.
├── pages/, components/      ← EXISTING. Never import @supabase or call .rpc directly.
└── integrations/supabase/   ← EXISTING. Only data/ imports from here.
```

**The single enforceable rule that makes this stick:** only files under `src/data/` and `src/integrations/` may import `@supabase/supabase-js` or `@/integrations/supabase/client`. Enforced via ESLint `no-restricted-imports`. Without that rule, the folders drift back into chaos within weeks.

Layer responsibilities:

| Layer | May import | Must NOT import |
|---|---|---|
| `domain/` | nothing app-specific (zod is fine) | React, Supabase, hooks, components |
| `data/` | `domain/`, `integrations/supabase/` | React, hooks, components |
| `hooks/` | `domain/`, `data/`, React, React Query | Supabase directly |
| `pages/`, `components/` | `domain/`, `hooks/`, components | Supabase directly, `data/` directly |

---

## Migration strategy — vertical slices via Lovable

Big-bang refactors via Lovable will produce chaos. The flow is:

1. **Slice 1 (pilot — 1 entity end-to-end):** pick one small, well-bounded feature. Move it into the new shape so the pattern is *visible in the repo* for Lovable to imitate. **Pilot pick: Lifecycle Checklists** (already has hooks; bounded; admin-only blast radius).
2. **Slice 2 (lock the rule):** add the ESLint guard + a one-page `<codebase>/src/ARCHITECTURE.md` that Lovable can read and follow.
3. **Slice 3+ (repeat):** one entity per Lovable prompt. Use the same prompt template. Don't refactor what you're not currently touching — let new work flow into the new shape.

This is a months-long drift, not a sprint. That's the point — Lovable does well with bounded prompts and badly with sweeping ones.

Acceptance for "the pattern has stuck": the next time Lovable generates a new feature, it lands in the new shape *without* the prompt explicitly demanding it. That's when this work is done.

---

## Slice 1 — Lifecycle Checklists pilot (Lovable prompt, ready to paste)

```
Refactor the Lifecycle Checklists feature to a Clean-Architecture-style
layered structure. This is a PILOT — the goal is to set a reusable pattern,
not to refactor anything else. Touch only files needed for this feature.

Scope: pages/admin/LifecycleChecklistsAdmin.tsx, hooks/useLifecycleChecklists*,
hooks/useLifecycleTemplates*, hooks/useLifecycleDropdowns*, and any direct
Supabase calls from those files.

Create the following NEW structure (do not move other features):

  src/domain/lifecycle-checklist/
    types.ts      — Domain types (LifecycleChecklist, LifecycleTemplate,
                    LifecycleDropdownOption). Do NOT re-export Supabase Row
                    types directly; declare named domain types and map at
                    the data layer.
    schema.ts     — Zod schemas for the same types. Export inferred types
                    from these schemas where it removes duplication.
    rules.ts      — Pure functions for any business rule currently inline
                    in the page or hook (e.g. canCopyToCounterpart). No
                    React, no Supabase.

  src/data/lifecycle-checklist/
    repository.ts — Functions: listTemplates, getTemplate, createTemplate,
                    updateTemplate, copyToCounterpart, listDropdowns.
                    Each function:
                      - is the ONLY place that calls supabase.rpc / .from
                        for this feature
                      - validates the response with the Zod schema and
                        returns the parsed domain type
                      - throws a typed RepositoryError on failure with
                        a discriminant: "not_found" | "forbidden" |
                        "validation" | "unknown"

Then UPDATE:

  src/hooks/useLifecycleChecklists.ts (and siblings)
    - Remove all direct Supabase calls.
    - Each hook is a thin React Query wrapper around a repository function.
    - Keep the existing hook signatures so the page does not have to change
      its imports beyond the hook level.

  src/pages/admin/LifecycleChecklistsAdmin.tsx
    - No Supabase imports.
    - Replace any inline business rule with a call to a function from
      src/domain/lifecycle-checklist/rules.ts.
    - Keep the UI behaviour identical — no visual or UX changes.

Do NOT:
  - Touch any other feature.
  - Modify src/integrations/supabase/types.ts.
  - Add a new state management library.
  - Bulk-tighten tsconfig.
  - Rename existing exports that other files import.

Add a short comment at the top of repository.ts and rules.ts that says:
  "Layer: data" / "Layer: domain — pure, no React, no Supabase."

Verify by:
  - grep src/pages/admin/LifecycleChecklistsAdmin.tsx for "supabase" — 0 hits
  - grep src/hooks/useLifecycle* for "supabase" — 0 hits
  - typecheck passes
  - the page renders and the existing copy-to-counterpart, list, create,
    edit flows still work
```

**Reconciliation after Slice 1 lands:**
- Add a brief `codebase-state/architecture.md` section describing the new layer convention.
- If Slice 1 reveals that the pattern needs adjustment (e.g. error discriminant set is wrong), update **this file** before Slice 2.
- Open audit entry in `unicorn-audit/` capturing what Lovable actually produced vs. the prompt — first slice always drifts from the spec.

---

## Slice 2 — Lock the rule (planned, not yet drafted)

Adds:
- ESLint `no-restricted-imports` config blocking `@supabase/*` and `@/integrations/supabase/client` everywhere except `src/data/**` and `src/integrations/**`.
- New file `<codebase>/src/ARCHITECTURE.md` (~1 page) describing the three layers and the import rule, in language Lovable can pattern-match against on future prompts.
- Optional: a `<codebase>/.cursorrules`-style or Lovable system-prompt note pointing at `ARCHITECTURE.md`.

Slice 2 is gated on Slice 1 being merged and reviewed.

---

## Future slices (provisional, ordered by likely tractability)

Not committed — re-rank after Slice 1.

- `domain/access/can.ts` — extract role checks; replace inline `profile?.unicorn_role === "Admin"` patterns lazily as files are touched.
- Split `useAuth` into `useSession` + `useProfile` + `useMemberships`.
- One slice per "next feature already on the roadmap" — every new feature lands in the new shape rather than retrofitting old ones.
- Eventually: tighten tsconfig (`strictNullChecks: true`) flag-by-flag with fix-as-touched.

The audits/EOS modules are big and tempting targets but high-risk for early slices — leave them until the pattern is proven on smaller features.

---

## Open questions

- **ESLint enforceability under Lovable.** Lovable may or may not respect a `no-restricted-imports` rule; needs Slice 2 to find out. If Lovable bypasses, fall back to the `ARCHITECTURE.md` convention + post-merge reconciliation.
- **Zod schema vs. Supabase types — drift.** The auto-generated `types.ts` is the source of truth for DB shape; domain Zod schemas are a separate source of truth for app shape. Mapping at the repository layer is the design, but it doubles maintenance for any column rename. Acceptable for now; revisit if it bites.
- **`Result<T, E>` vs. throwing.** Slice 1 prompt says "throws typed RepositoryError." Cleaner is a `Result` type, but throwing fits React Query's existing error path with no plumbing changes. Re-evaluate after a few slices.
- **Where does `domain/access/` end and `pinned/conventions.md` begin?** RBAC rules touch policy. Code-level helpers belong in `domain/`; the *spec* of who-can-do-what may want to also live in `pinned/conventions.md`. Decide when the helper exists.

---

## Cross-references

- Roadmap entry: `reference/cadence.md → Roadmap → Next`.
- Existing seams identified during the survey: `<codebase>/src/services/codeTablesService.ts` (only existing data-layer file), `<codebase>/src/hooks/` (238 hooks, mostly data fetching).
- Will eventually update `codebase-state/architecture.md` once Slice 1 + Slice 2 land.
- If this gets adopted as a committed direction, promote to an ADR in `reference/decision-trail.md` and an Open → decided entry in `pinned/decisions.md`.

---

## Status log

- **2026-04-27** — Proposal drafted from architecture survey of `<codebase>@cf8d1314`. No Lovable prompt sent yet. No code changed.
