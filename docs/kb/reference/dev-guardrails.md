# Dev Guardrails — Regression Prevention

> **Last updated:** 2026-04-29 · **Reconsider by:** 2026-07-29 · **Confidence:** high — grounded in real incidents: ManageTenants pagination regression (2026-04-28), AcceptInvitation blank-screen fix (2026-04-28), `client_audits` constraint gap and label map drift (2026-04-29).
>
> Practical process for preventing regressions when shipping via Lovable or Claude Code. Applies to optimisations, refactors, and data-fetch changes in particular — the category most likely to silently break other UI features.

---

## Why this exists

The ManageTenants pagination fix (April 2026) introduced a silent regression: the four summary stat cards (Total Clients, Active, Suspended, Closed) derived their counts from `tenants.length` — the in-memory array — rather than a dedicated database count query. When the fetch was capped at 100 rows, the cards showed 100 regardless of the real tenant count. No data was lost; the display was wrong. It was caught by a stakeholder, not by the team.

The root cause was not carelessness. It was that **Lovable does what you ask, nothing more** — paginate the fetch, and it paginates the fetch. It does not know what else depends on the array size unless you tell it. And there was no step in the shipping process that would have caught the regression before it hit production.

These guardrails close that gap.

---

## The three mandatory steps

### Step 1 — Blast-radius check (before writing the Lovable prompt)

Before sending any optimisation or data-fetch change to Lovable, ask Claude:

> "What else in this file or the codebase reads from or depends on the data this change touches? List every consumer."

Do this for:
- Any change to how data is fetched (adding `.range()`, switching to React Query, changing a hook)
- Any change to shared state (removing a `useState`, renaming a variable, merging two arrays)
- Any change to a component that other components import from

Record the answer. If there are consumers beyond the thing you're fixing, the Lovable prompt must account for all of them.

---

### Step 2 — Write a scoped Lovable prompt

Every prompt for a performance or data-fetch change must include two things the basic prompt omits:

**a) An explicit "do not touch" list**

Name every UI element that must produce the same result after the change:

> "Do not change how the stat cards, CSC load bar, filter counts, or pagination controls are computed. Only change [the specific thing]."

**b) A dependency note**

If the blast-radius check found consumers, state them explicitly:

> "Note: the Total Clients stat card reads from `tenants.length`. If you are changing how `tenants` is populated or sized, the stat card must be updated to use a separate count source."

Without this, Lovable will not know the dependency exists.

---

### Step 3 — Post-pull verification checklist

After every `git pull` of a Lovable change, run the relevant page checklist below before marking the task done. This is the minimum browser test — not QA, just a smoke check of the highest-risk surfaces.

**Always check:**
- [ ] The thing that was changed works on the golden path
- [ ] At least one edge case for the changed feature (empty state, error state, boundary value)

**For data-fetch or pagination changes, also check:**
- [ ] Summary / stat cards show correct totals (match what you'd expect from the DB)
- [ ] Row counts in tables match stat card totals
- [ ] Filters still narrow results correctly
- [ ] Any "Load More" or pagination controls work and update counts
- [ ] CSC load bar totals (if on a page with CSC assignment) still sum correctly

**For React Query migration (replacing bare useEffect):**
- [ ] Data loads on first visit
- [ ] Data refreshes correctly after a mutation (add, edit, delete)
- [ ] Realtime updates still trigger the correct re-fetch or invalidation
- [ ] No duplicate fetch calls visible in the network tab

---

## Known regression traps

These are patterns that have caused or will cause silent regressions. Treat each as a rule.

### Trap 1 — Deriving counts from a paginated array

**Pattern:** `tenants.length`, `items.filter(...).length`, or any count computed from an in-memory array that is populated by a paginated query.

**Risk:** If you paginate the fetch, the count reflects only the loaded page. Stat cards, CSC load bars, and filter counters all break silently — no error, just wrong numbers.

**Rule:** Summary statistics (totals, status counts, load distributions) must always come from a dedicated count query, never from the length of a paginated list. Use `select('id, status')` with no `.range()` limit in a separate hook, or use Supabase's `{ count: 'exact', head: true }` option.

---

### Trap 2 — Removing a useState that other JSX reads

**Pattern:** Removing or renaming a state variable during a React Query migration without checking all the JSX that references it.

**Risk:** The component silently renders nothing, or a section disappears, if JSX still references the old variable name.

**Rule:** When removing state during a migration, grep the file for every reference to that variable name before sending the Lovable prompt. Name them in the prompt.

---

### Trap 3 — Realtime handler calling a full-fetch function

**Pattern:** `.channel()` subscription handler calls `fetchAll()` or `fetchTenants()` — a function that re-runs all queries — instead of a scoped invalidation.

**Risk:** Every realtime event triggers a full re-fetch waterfall, compounding load and causing UI flicker.

**Rule:** Realtime handlers must call `queryClient.invalidateQueries({ queryKey: [...] })` for the affected query only, not a function that re-fetches everything. The ManageTenants fix (Phase 1, April 2026) established this pattern.

---

### Trap 4 — setLoading(false) outside a finally block

**Pattern:** `setLoading(false)` or `setValidating(false)` appears only inside the `try` block or after an `await`, not in `finally`.

**Risk:** If the fetch throws or times out, the loading state never clears. The user sees a permanent spinner with no way out.

**Rule:** Every `setLoading(true)` must have a matching `setLoading(false)` inside a `finally` block. No exceptions. The AcceptInvitation diagnosis (April 2026) found this pattern in multiple pages — see the platform-wide audit results in `unicorn-audit/audit/2026-04-28-accept-invitation-blank-screen-fix.md`.

---

### Trap 5 — Error branch that returns null

**Pattern:** `if (!data) { return null; }` as the error or loading-failed branch.

**Risk:** The user sees a completely blank page. No heading, no explanation, no retry. Toast notifications auto-dismiss — after a few seconds there is nothing on screen and no way to proceed.

**Rule:** Every `if (!data)` branch that can be reached after a failed fetch must render an explicit error state: a heading, a description, and a retry action. `return null` is only acceptable for loading skeletons where a spinner is already rendered in a parent.

---

### Trap 6 — Adding an `AuditType` value without updating all label maps

**Pattern:** A new value is added to the `AuditType` union in `src/types/clientAudits.ts` — or an existing label is renamed — without updating the edge function's local copy of the map.

**Risk:** The edge function cannot import from `src/` (Deno runtime), so it maintains its own `AUDIT_TYPE_LABELS` in `supabase/functions/research-audit-intelligence/index.ts`. When that copy falls behind, intelligence pack report headers and the Perplexity AI prompt receive the raw enum string (`due_diligence_combined`) instead of a human label (`Combined RTO + CRICOS Due Diligence`). Lovable has no reference to compare against and may also choose a shorter form — e.g. `"CHC"` instead of the canonical `"CHC — RTO"` — creating a label inconsistency across the platform.

**Origin:** April 2026 — edge function `AUDIT_TYPE_LABELS` carried only 5 legacy ASQA types when the `AuditType` union had 7 values. On fix, Lovable chose `compliance_health_check: "CHC"` which mismatched the canonical `"CHC — RTO"` in `src/types/clientAudits.ts`. Caught by cross-map audit immediately after the pull. See `unicorn-audit/audit/2026-04-29-client-audits-audit-type-constraint.md → Finding 4`.

**There are currently three `AUDIT_TYPE_LABELS` maps in the codebase:**

| File | Coverage | Import source |
|------|----------|---------------|
| `src/types/clientAudits.ts` | 7 `AuditType` values | **Canonical — all others must match this** |
| `supabase/functions/research-audit-intelligence/index.ts` | 5 legacy ASQA + 7 `AuditType` | Manual copy — cannot import from `src/` |
| `src/components/tenant/AuditIntelligencePackPanel.tsx` | 5 legacy ASQA only | Local copy — should import from canonical |

**Rule:**
1. `src/types/clientAudits.ts` is the single source of truth for `AuditType` labels.
2. Whenever `AuditType` gains a new value **or** an existing label is renamed in `src/types/clientAudits.ts`, the edge function map must be updated in the same Lovable prompt with the identical string.
3. Before approving any Lovable prompt that touches either map, cross-check every key and value against the canonical source.
4. `AuditIntelligencePackPanel.tsx` should be migrated to import from `src/types/clientAudits.ts` to eliminate its local copy (pending Angela's confirmation on scope — see open question in the audit doc).

---

### Trap 7 — Adding an `AuditType` value without updating the DB CHECK constraint

**Pattern:** A new value is added to the `AuditType` union in `src/types/clientAudits.ts` without a corresponding migration widening `client_audits_audit_type_check`.

**Risk:** The frontend will accept the new audit type through the wizard UI with no error. The insert call in `useCreateAudit` passes `selectedCard.value` directly to the DB. The DB will reject it with a PostgreSQL constraint violation, which surfaces only as a generic `Failed to create audit` toast — no visible indication of the root cause.

**Origin:** April 2026 — `due_diligence_combined` was in the `AuditType` union and all UI components handled it correctly, but the DB constraint was never widened. Any attempt to create a Combined RTO + CRICOS Due Diligence audit failed silently. See `unicorn-audit/audit/2026-04-29-client-audits-audit-type-constraint.md → Finding 2`.

**Rule:** Every addition to `AuditType` in `src/types/clientAudits.ts` must be paired with a migration that adds the new value to `client_audits_audit_type_check`. Verify the constraint first:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.client_audits'::regclass AND contype = 'c';
```

The current allowed values (post April 2026 fix) are:
`compliance_health_check`, `cricos_chc`, `rto_cricos_chc`, `mock_audit`, `cricos_mock_audit`, `due_diligence`, `due_diligence_combined`.

---

### Trap 8 — Dropping an index that a live function depends on via a different ON CONFLICT pattern

**Pattern:** A table has duplicate indexes and the fix drops all but one. The diagnosis checks the index definitions and picks the "best" one to keep, but does not check every ON CONFLICT clause across all live functions and edge functions.

**Risk:** PostgreSQL's `ON CONFLICT (col)` and `ON CONFLICT (col) WHERE condition` are different conflict targets — each requires a different index type as its arbiter. A partial unique index (`WHERE col IS NOT NULL`) cannot satisfy `ON CONFLICT (col)` without a WHERE clause. A non-partial unique index cannot satisfy `ON CONFLICT (col) WHERE col IS NOT NULL`. If multiple live functions use different patterns on the same column, you need both index types. Dropping the wrong one causes a PostgreSQL runtime error on every affected insert — silent until that code path fires in production.

**Origin:** May 2026 — `user_notifications.dedupe_key` had three indexes (one non-partial, two identical partials). The bug doc said to keep one partial index and drop the other two. Diagnosis confirmed the index definitions matched but did not check all ON CONFLICT patterns. Step 3 (blast radius) caught that two live trigger functions used `ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING` (needs the partial index) while two other trigger functions and two edge functions used `ON CONFLICT (dedupe_key) DO NOTHING` without WHERE (needs the non-partial). The fix was revised: drop only the duplicate partial index, keeping both the non-partial and one partial.

**Rule:** When diagnosing index redundancy on any table, always:
1. List every ON CONFLICT clause across every migration function body and edge function that inserts into that table.
2. Group them by pattern: with WHERE, without WHERE, plain insert.
3. Confirm a surviving index exists for each pattern before declaring any index safe to drop.

```sql
-- Quick check: all functions that reference the table
SELECT routine_name
FROM information_schema.routines
WHERE routine_definition ILIKE '%<table_name>%'
AND routine_schema = 'public';
```

Then grep migration files and edge functions for `ON CONFLICT` patterns on that table's columns.

---

## Design gates

These checks run during feature design — before writing any Lovable prompt. They catch structural mistakes that regression traps cannot, because the mistake happens at the design stage, not the shipping stage.

### dd_ table check — configuration belongs to data, not code

Run this check during feature design, before writing any Lovable
prompt. Ask: does this feature introduce any selectable options,
types, statuses, categories, or classifications that a user could
ever want to change without developer help?

- If YES → it needs a `dd_` table, not a hardcoded list. Never
  hardcode options in the frontend, a TypeScript enum, or a CHECK
  constraint. Follow `conventions.md → dd_ tables` before
  designing the schema. Check if the table already exists first —
  40+ `dd_` tables exist as of April 2026. Query
  `information_schema.tables WHERE table_name LIKE 'dd_%'` in
  the Supabase SQL editor before creating a new one.
- If NO → continue.

The principle: configuration belongs to data, not code. Super
Admins manage options through the Code Tables Management UI.
Developers build features, not lists.

The `client_audits.audit_type` bug (April 2026) is the canonical
example of what happens when this rule is skipped — a hardcoded
CHECK constraint got out of sync with the frontend enum and
silently blocked production inserts for weeks before being caught.

(Dave direction, 29 April 2026. Applied first via dd_audit_type
conversion — see
unicorn-audit/audit/2026-04-29-audit-type-fixes-and-dd-conversion.md)

---

## Page-specific smoke-test reference

Quick checklist per page for the highest-risk pages in the platform.

### ManageTenants

- Total Clients count matches the real DB count (not the page size)
- Active / Suspended / Closed / Archived counts sum to Total Clients
- CSC load bar names and numbers match the Active count distribution
- Table row count in the current view matches expectations given active filters
- Load More adds rows and all four stat cards update
- Adding a tenant via AddTenantDialog increments Total Clients
- CSC quick-assign updates the CSC load bar without full page reload

### AcceptInvitation

- Valid token → spinner → form pre-populated with name and email from invitation
- Expired token → error heading + description + Try again button (not blank screen)
- Invalid / missing token → same error UI as above
- Try again button re-runs validation without page reload
- Successful signup → redirect to dashboard within 2 seconds

---

## When to escalate vs. proceed

If the blast-radius check turns up consumers you cannot account for in the prompt, **stop and flag to Carl** before prompting Lovable. Do not guess.

If a post-pull check reveals a broken surface, **do not mark the task done**. Raise a follow-up prompt to Lovable immediately, or document the regression in `unicorn-kb/reference/brainstorm-log.md` with a severity rating.

If a Lovable change touches RLS policies or database migrations, also apply the checklist in `pinned/conventions.md → New table checklist`. These guardrails do not replace that one — they sit alongside it.
