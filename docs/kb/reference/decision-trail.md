# Decision Trail (ADRs)

> **Last updated:** 2026-09-10 · **Reconsider by:** 2027-05-15 · **Confidence:** medium — ADR-003 tenant ID corrected to 6372 (April 2026 audit). ADRs 001–004 and 006–010 are reconstructed from code and sibling-project docs; ADR-005 and ADR-008 are verbatim from sibling-project incidents and may or may not have occurred identically here. ADR-011 added 2026-04-27 to document the current operating model (no peer review; Lovable owns schema in practice). ADR-013 added 2026-05-15 to record the flagship-surfaces reframing (CSC workflow + Client Portal + Vivacity Academy; EOS reclassified as internal operating system; amends ADR-006). ADR-014 added 2026-09-01, amending ADR-011's "no gate for hand-written code" claim to reflect the current branch+PR discipline in `AGENTS.md` (Lovable's own direct-to-main behavior, per ADR-011, is unchanged). ADR-015 added 2026-09-09 to record the bounded RBAC staff-read compatibility baseline; ADR-016 added 2026-09-09 to record the bounded hard-Super-Admin control baseline. ADR-017 added 2026-09-10 to record the Tenant Operating Model §18 item 2 decision (tenant status/lifecycle/access vocabulary and single-writer consolidation); ADR-018 added 2026-09-10 to record the TOM §18 item 3 decision (`tenants.id` ratified as the canonical key, `id_uuid` mandatory for external integration contracts). The future portfolio-scope, capability-catalogue, delegation, and break-glass decisions remain open, as do TOM §18 items 4-13. RJ should review legacy ADRs before treating as canonical; ADR-011, ADR-013, ADR-014, ADR-015, ADR-016, ADR-017, and ADR-018 are canonical for current state.
>
> Architecture Decision Records for Unicorn 2.0.
> Purpose: preserve the *why* behind each decision so it isn't re-litigated, create a defensible paper trail, and give future devs (and Claude) context for judgment calls.
>
> **This differs from [05-product-decisions.md](../pinned/decisions.md):** that file is the quick-reference summary. This is the long-form reasoning with alternatives, risks, and consequences.

Several ADRs below are carried forward from a sibling Vivacity Supabase project where the reasoning applies to this codebase, even if the implementation details (function names, table names) differ. Where an ADR was directly observed in that project rather than this one, it's noted in the confidence header.

---

## Format

```
### ADR-[number]: [title]
**Date:** when decided
**Status:** Decided | Superseded | Reversed | Under review
**Decided by:** person(s)
**Context:** what drove this decision
**Decision:** what was chosen
**Reasoning:** why this over alternatives
**Alternatives considered:** what else + why rejected
**Risks accepted:** what could go wrong
**Consequences:** what this enables / constrains
**Linked to:** related docs
```

---

## Records

### ADR-001: Platform — Lovable + Supabase
**Date:** April 2025
**Status:** Decided
**Decided by:** RJ Badua
**Context:** Unicorn 2.0 needed to ship fast with a small team (RJ + a junior dev), backed by the existing multi-tenant Supabase patterns.
**Decision:** Frontend in Lovable (React + Vite + TS + shadcn-ui + Tailwind); Supabase as the primary backend.
**Reasoning:** Lovable accelerates UI delivery and suits a small team well. Supabase provides auth, Postgres with RLS, Storage, Edge Functions, and Realtime in one integrated package — matching the data-first product.
**Alternatives considered:**
- Full custom React app (Create React App / Next.js): rejected — too slow to deliver with this team size.
- Alternative BaaS (Firebase, PlanetScale + Clerk, etc.): rejected — Supabase's RLS model is load-bearing for this product.
**Risks accepted:**
- Lovable may scaffold schema we don't want — mitigated by the hard rule "Lovable is UI-only, schema goes through RJ".
- Lovable UI customization may require working around its conventions occasionally.
**Consequences:** Schema decisions never go through Lovable. All AI logic goes server-side. Every frontend PR should be reviewable without needing to "reason like Lovable".
**Linked to:** [01-architecture.md](../codebase-state/architecture.md) · [05-product-decisions.md](../pinned/decisions.md#platform)

---

### ADR-002: AI logic must never live in the frontend
**Date:** April 2025
**Status:** Decided — upheld in production
**Decided by:** RJ Badua
**Context:** AI-assisted workflows (suggestions, analysis, report drafting) will grow in scope. Where does the logic live?
**Decision:** All AI integrations run via Supabase Edge Functions or n8n/Awesomate. Zero AI logic in the frontend. API keys never touch the client.
**Reasoning:** Security (no API keys in client bundles), maintainability (centralised), auditability (edge function logs).
**Alternatives considered:**
- Direct LLM API calls from the frontend: rejected on security grounds.
- AI logic in DB functions: rejected — wrong layer for HTTP calls.
**Risks accepted:** Edge function cold starts add latency. Acceptable for the workflows involved.
**Consequences:** Every AI capability is an edge function or an n8n workflow. Currently one live: `ai-generate-suggestions`.
**Linked to:** [01-architecture.md](../codebase-state/architecture.md) · [02-system-design.md → Edge functions](../codebase-state/architecture.md#edge-functions)

---

### ADR-003: Multi-tenant model — tenant_id 6372 = Vivacity, others = clients
**Date:** 2025
**Status:** Decided — tenant ID corrected April 2026
**Decided by:** RJ Badua
**Context:** A consultancy-plus-clients platform needs an unambiguous way to distinguish staff from client users without adding a separate staff table.
**Decision:** Tenant ID `6372` is the Vivacity staff tenant. All other tenants are client RTOs. Role values differ per tenant type.
**Correction (April 2026 audit):** ~~KB previously stated tenant 319~~ — the actual hardcoded constant in `invite-user/index.ts:24` and `src/hooks/useVivacityTeamUsers.tsx:24` is `VIVACITY_TENANT_ID = 6372`. The value `319` came from a sibling Vivacity Supabase project and was incorrectly carried over into this KB.
**Reasoning:** Reuses the existing tenant model; `is_vivacity()` becomes a one-line check; role mismatches become rejectable at the invite layer.
**Alternatives considered:**
- Separate `staff_users` table: rejected — doubles the auth model complexity.
- Boolean flag on `users`: rejected — conflates identity with access; easier to get wrong in RLS.
**Risks accepted:**
- Hardcoded `6372` is a magic number. Mitigated by isolating it to a small number of places (edge function constants, helper function, exported from `useVivacityTeamUsers`).
- If Vivacity ever needs multiple staff tenants, this model bends.
**Consequences:** Every role check is `tenant_id === 6372 ? vivacity_roles : client_roles`. Every RLS policy checks either `is_vivacity()` or tenant membership.
**Linked to:** [01-architecture.md → Multi-tenancy](../codebase-state/architecture.md#multi-tenancy) · [02-system-design.md](../codebase-state/architecture.md#multi-tenant-model) · [supabase/functions/invite-user/index.ts:24](../../../supabase/functions/invite-user/index.ts)

---

### ADR-004: Edge functions use service-role + manual auth
**Date:** 2025–2026 (evolved pattern)
**Status:** Decided — canonical
**Decided by:** RJ Badua
**Context:** Edge functions need to perform privileged work (create auth users, cross-tenant writes, etc.) that the caller can't do under RLS.
**Decision:** Edge functions instantiate Supabase with the service-role key (bypassing RLS) and manually validate the caller: token → `auth.getUser(token)` → `users` row → role/tenant check.
**Reasoning:** Service role is the only way to do the privileged work. But bypassing RLS means the function itself must enforce authorization. Always validate the caller before any privileged action.
**Alternatives considered:**
- User-scoped Supabase client in the function: rejected — can't do service-role work.
- Postgres SECURITY DEFINER functions: considered for narrow cases; edge functions chosen for HTTP orchestration flexibility.
**Risks accepted:** If authorization is skipped in a new function, it's a full system compromise. Mitigation: canonical pattern in [02-system-design.md](../codebase-state/architecture.md#edge-functions) and review discipline.
**Consequences:** Every new edge function follows the pattern: token → user → profile → role check → payload validate → work → structured JSON response.
**Linked to:** [02-system-design.md → Edge functions](../codebase-state/architecture.md#edge-functions)

---

### ADR-005: RLS — two distinct failure modes, three-step enforcement {#adr-005}
**Date:** April 2026 (reconstructed from sibling-project incidents)
**Status:** Decided — enforced as hard convention
**Decided by:** RJ Badua
**Context:** Two separate RLS failures in the sibling Vivacity project in April 2026:
1. **Failure mode 1:** Six tables had correctly written RLS policies but RLS itself was disabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` never ran). Silent failure — policies look right in Studio, but they're inactive.
2. **Failure mode 2:** After enabling RLS, Vivacity staff got "not found" on every record. The tables had tenant-scoped SELECT policies but no staff ALL policy. Consultants aren't `tenant_members` of client RTOs — they're in tenant 319 — so the tenant-scoped SELECT blocked them entirely.

**Decision:** Every mixed staff+client table requires three distinct steps:
1. Tenant-read SELECT policy (via `tenant_members` check).
2. Staff ALL policy (`is_vivacity()`).
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, verified in Supabase Studio.

**Reasoning:** Each step is independently breakable and silently wrong. No single step subsumes another.
**Alternatives considered:**
- Rely on code review: rejected — failure mode 1 slipped review across six tables; failure mode 2 was only caught in production.
- Automated lint / schema check: possible future mitigation but not yet built.
**Risks accepted:** None — strictly safer convention with no trade-offs.
**Consequences:** New table checklist ([02-system-design.md](../codebase-state/architecture.md#new-table-checklist)) mandates all three. RJ reviews every migration.
**Linked to:** [02-system-design.md](../codebase-state/architecture.md#rls) · [01-architecture.md → Multi-tenancy](../codebase-state/architecture.md#multi-tenancy)

---

### ADR-006: EOS Level 10 as a first-class product surface
**Date:** 2025
**Status:** Decided — shipped
**Decided by:** Vivacity product leadership + RJ
**Context:** Vivacity runs its own business on EOS and delivers EOS services to clients. Spreadsheets and standalone tools (Ninety.io, Bloom Growth) were costly and didn't integrate with the consultancy's CRM workflow.
**Decision:** Build the full EOS Level 10 methodology natively — V/TO, Rocks, Scorecard, Issues (IDS), To-Dos, Level 10 Meetings (live real-time), Accountability Chart, Quarterly Conversations.
**Reasoning:** Differentiates Unicorn 2.0; allows Vivacity to "dogfood" the product; sellable to client RTOs as their own EOS platform; tight integration with client records and pipeline.
**Alternatives considered:**
- Integrate with Ninety.io / Bloom Growth: rejected — third-party tools don't tie back to client records and pipeline.
- Defer EOS module to post-launch: rejected — it's core to how Vivacity operates.
**Risks accepted:** Scope creep — EOS module is large. Mitigated by shipping iteratively and following the spec in [docs/EOS_LEVEL10_SPECIFICATION.md](../../../docs/EOS_LEVEL10_SPECIFICATION.md).
**Consequences:** EOS occupies the largest subtree in `src/components/` and `src/pages/`. Real-time patterns were introduced primarily to support live meetings — reuse that infrastructure for future collaborative features.
**Linked to:** [04-module-status.md → EOS](../codebase-state/module-status.md#3-eos-level-10-meeting-module) · [docs/EOS_LEVEL10_SPECIFICATION.md](../../../docs/EOS_LEVEL10_SPECIFICATION.md)

---

### ADR-007: Transactional email via Mailgun
**Date:** 2025
**Status:** Decided — in production
**Decided by:** RJ
**Context:** Invitations and auth emails needed a reliable transactional sender with template support.
**Decision:** Use Mailgun. Templates live in [templates/mailgun/](../../../templates/mailgun/) and [supabase/email-templates/](../../../supabase/email-templates/). Invocation via `send-invitation-email` edge function.
**Reasoning:** Existing account; good deliverability in AU; simple API; supports Supabase's template variable model.
**Alternatives considered:**
- Resend, Postmark, SendGrid, AWS SES — all viable. Mailgun was the existing account with least friction.
- Supabase built-in SMTP: rejected — insufficient for templated marketing sends and poor deliverability for high volume.
**Risks accepted:** Vendor lock-in on templates; deliverability ownership.
**Consequences:** All transactional email goes through `send-invitation-email` or Supabase auth email config. Campaign / broadcast email is an open question — decide before building.
**Linked to:** [04-module-status.md → Campaigns/Email](../codebase-state/module-status.md#9-campaigns--email)

---

### ADR-008: NOT NULL columns with frontend writes need coercion triggers {#adr-008}
**Date:** April 2026
**Status:** Decided
**Decided by:** RJ
**Context:** Lovable-generated form submissions send `null` for empty fields rather than omitting them. Column defaults in Postgres only apply when a column is **absent** from the INSERT — explicit `NULL` overrides the default and triggers a NOT NULL violation.
**Decision:** For any NOT NULL column that receives writes from Lovable forms, add a `BEFORE INSERT OR UPDATE` trigger that COALESCEs nulls to the intended default.
**Reasoning:** Fixing it at the DB layer is more robust than enforcing omit-on-empty in every frontend form — Lovable may regenerate the form and lose the fix.
**Alternatives considered:**
- Fix the frontend in each form: rejected as fragile.
- Make the column nullable: rejected when the default is semantically correct and should be enforced.
**Risks accepted:** Trigger adds implicit behaviour — anyone writing raw SQL against the table should know nulls are silently coerced. Document in migration notes.
**Consequences:** Pattern reusable for any similar column. See [02-system-design.md → Coercion triggers](../codebase-state/architecture.md#coercion-triggers-for-not-null--frontend-writes).

---

### ADR-009: react-query as the canonical data layer
**Date:** 2025–2026 (reconstructed)
**Status:** Decided — canonical
**Decided by:** RJ
**Context:** Multiple competing patterns for async data fetching (ad-hoc useEffect, useSWR, react-query) fragment the codebase and make caching/invalidation inconsistent.
**Decision:** `@tanstack/react-query` is the canonical data layer. `QueryClientProvider` wraps the router.
**Reasoning:** Centralises caching, retries, and invalidation; integrates well with Supabase; eliminates most useEffect-based data fetching.
**Alternatives considered:**
- SWR: viable but react-query has a richer mutation API.
- Raw fetch + useEffect: rejected — no caching, no dedup, no stale-while-revalidate.
**Risks accepted:** Team must learn query keys and cache invalidation model.
**Consequences:** All new async data goes through `useQuery`/`useMutation`. Query keys follow `[domain, subentity, ...args]` convention.
**Linked to:** [03-flow-patterns.md → Data fetching pattern](flow-patterns.md#data-fetching-pattern-canonical)

---

### ADR-010: Realtime via Supabase channels
**Date:** 2025
**Status:** Decided — in production (live meetings)
**Decided by:** RJ
**Context:** EOS live meetings need multi-participant real-time sync. Also likely useful for collaborative editing in other modules.
**Decision:** Use Supabase's `postgres_changes` realtime channels. One channel per domain entity instance.
**Reasoning:** Integrated with RLS; no separate WebSocket server; simple client API.
**Alternatives considered:**
- Standalone WebSocket server (e.g., Ably, Pusher): rejected — extra infra and auth complexity.
- Long-polling: rejected — worse UX.
**Risks accepted:** Supabase realtime has rate and size limits. For very high-volume events, may need to batch or route through an edge function.
**Consequences:** Channel cleanup discipline is mandatory. See [03-flow-patterns.md → Real-time subscriptions](flow-patterns.md#real-time-subscriptions).

---

### ADR-011: Operating model — Lovable is the workflow; no peer review or sign-off gates {#adr-011}
**Date:** 2026-04-27
**Status:** Decided — describes current reality
**Decided by:** Carl Simpao (project lead + KB owner), with Angela's awareness as product owner

**Context:** The KB previously documented review processes that no longer match how the team works. Earlier ADRs and conventions described:

- ADR-001's risk-mitigation note "Lovable is UI-only, schema goes through RJ"
- `pinned/conventions.md → Migrations` claiming "RJ reviews before any migration is applied to production"
- `pinned/orientation.md → Ground rules` item 3 claiming "Lovable never owns schema"
- `reference/cadence.md → Shipping discipline` claiming "RLS changes require RJ sign-off before migration runs in production"
- ADR-005's consequence "RJ reviews every migration"
- `reference/cadence.md → Definitions of done` claiming UI features are "code reviewed" and schema changes require "RJ signed off"

In practice, as of April 2026: Angela and Dave develop predominantly through Lovable, which generates schema migrations alongside frontend code and pushes both direct to `main`. There is no peer review at any layer. There is no schema sign-off. There is no RLS sign-off. The architect seat (formerly RJ's) was retired in the 2026-04-27 seat-centric restructure (`pinned/team-roles.md`); RJ now works primarily on Vivacity's other product, ComplyHub. No replacement gate-keeper was established. Hand-written code via Claude Code lands on feature branches and merges via PR — also without mandatory review.

**Decision:** The KB will document this operating model honestly rather than continue to claim review processes that don't exist. The trade-off — Lovable velocity over schema rigor — is accepted. Failures that result will be traced back to this ADR.

**Reasoning:**
- **Honesty over aspiration.** A KB that describes a process the team doesn't follow becomes silently wrong over time. Onboarding readers form expectations that reality contradicts. Failure modes get mis-attributed (e.g. "we missed an RLS step" rather than "no review process exists to catch missed RLS steps").
- **Velocity is the actual constraint.** Vivacity's small team and Lovable's pace are why the company can ship at the rate it does. Adding a synchronous review gate would require either hiring or scope reduction; neither is on the table.
- **Capturing reality enables future change.** Once this is written down, the team can decide *whether* to add review gates with full information about what's currently absent. Without this ADR, the question keeps surfacing implicitly each time something slips through.

**Alternatives considered:**
- **Restore the architect-seat review gate.** Rejected — RJ is no longer available for Unicorn review work, and no other team member combines the depth and the bandwidth.
- **Add async post-merge review by Carl.** Possible future evolution but not adopted now. Would be a follow-up ADR if/when adopted.
- **Restrict Lovable's schema authority.** Rejected — Lovable generates schema as part of its feature flow; restricting that effectively means hand-writing those features, which contradicts ADR-001's velocity rationale.
- **Keep claiming the review process exists.** Rejected as actively harmful: it sets onboardees up to fail, mis-attributes incident causes, and erodes trust in the KB.

**Risks accepted:**
- **Silent RLS failures.** ADR-005 named two failure modes that were caught (on the sibling project) only because someone reviewed the migrations. Without review, those modes can ship undetected. Partial mitigation: RLS issues tend to surface fast — staff get "not found" on every record, or clients see other tenants' data — so the incident is loud, even if pre-merge review is absent.
- **Convention drift.** `pinned/conventions.md` describes patterns (query keys, edge function structure, coercion triggers) that Lovable doesn't necessarily follow. Hand-written code via Claude Code still aims to match these; Lovable-generated code may not.
- **No second pair of eyes.** Cross-cutting bugs that span files or require holistic understanding land without review.
- **Compounding undocumented decisions.** Lovable makes implementation choices (table names, column types, function signatures) without a human deciding them deliberately. These accumulate as facts that nobody chose, only accepted.

**Consequences:**
- **For the KB:** Cross-references to "RJ reviews migrations," "schema goes through RJ," and "code reviewed" are removed or rewritten as descriptive ("when hand-writing code, follow this pattern") rather than prescriptive ("this is enforced via review"). PR2 makes these edits across `pinned/conventions.md`, `pinned/orientation.md`, and `reference/cadence.md`.
- **For ADR-001:** The risk-mitigation note "Lovable is UI-only, schema goes through RJ" is no longer in effect. ADR-001's *platform decision* (Lovable + Supabase) stands; only that mitigation is retired.
- **For ADR-005:** The three-step RLS ritual remains the correct technical pattern. The consequence "RJ reviews every migration" is no longer in effect.
- **For incident response:** When a production failure traces to a missed RLS step, missed coercion trigger, or any other convention violation — the trace stops here. The cause is "no review process exists"; the fix is either a one-off correction or a follow-up ADR establishing review.
- **For onboarding:** New readers should expect conventions to be aspirational targets, not enforced rules, for Lovable-generated code.

**Linked to:**
- ADR-001 (platform decision; Lovable-is-UI-only mitigation retired)
- ADR-005 (RLS three-step ritual; "RJ reviews every migration" consequence retired)
- `pinned/team-roles.md → Authority` (no schema/RLS gate today)
- `pinned/conventions.md → Scope of these conventions` (added in this PR)
- `reference/cadence.md → Shipping discipline` (review claims removed in this PR)

---

### ADR-012: Audit-entry authorship — split by session type {#adr-012}
**Date:** 2026-04-28
**Status:** Decided — amends but does not supersede ADR-011
**Decided by:** Carl Simpao (project lead + KB owner), per authority granted in ADR-011. Angela not consulted.

**Context:** ADR-011 established the current operating model. A new handoff, `handoffs/lovable-production-db-change.md`, was added on the same date to document the workflow for production DB changes via Lovable. That handoff requires an audit entry at session end. Routing every audit entry through Carl creates lag between execution and record — the dev running the session has the context; Carl does not. At the same time, Carl's reconciliation narrative (post-remix audit entries, tenant reconciliations, operating-model ADRs) is interpretive work that only the KB owner should author.

**Decision:** Audit-entry authorship is split by session type:
- **Lovable production DB change sessions:** the dev running the session writes the audit entry. Carl reviews (PR review; does not auto-merge). Governed by `handoffs/lovable-production-db-change.md`.
- **All other audit entries** (reconciliations, post-remix events, standing audit narrative, ADR-driven audits): Carl sole author. No change from ADR-011.

**Reasoning:** Production DB changes via Lovable need a paper trail at the point of execution. The dev has the live context — constraint names, row counts, dry-run output, timing. Having Carl write it up later introduces lag and loses precision. Reconciliation narrative is different in kind: it is interpretation and synthesis, not a session log, so Carl-only authorship there is load-bearing.

**Alternatives considered:**
- **Keep Carl sole author; devs submit notes for Carl to write up.** Rejected — lag plus context loss. The narrative degrades from a session log to a summary of a summary.
- **Open audit authorship to all session types.** Rejected — signal-to-noise problem. The audit trail's value comes from discipline about what goes in it. Opening it broadly risks dilution with routine work that belongs in git history, not in a point-in-time audit record.

**Risks accepted:**
- Dev-authored entries may lack the consistency of Carl-authored entries. Mitigated by the audit template in `unicorn-audit/README.md` and Carl's PR review gate.
- The PR review gate adds one step to the session close. Acceptable given the stakes of a production DB change.

**Consequences:**
- `unicorn-audit/` write access expands to all devs (Angela, Carl, Dave, RJ, Khian) for Lovable production DB change sessions.
- `pinned/team-roles.md`, `pinned/kb-hygiene.md`, `handoffs/lovable-production-db-change.md`, `unicorn-audit/README.md`, `unicorn-audit/CLAUDE.md`, and `~/repository/unicorn-workspace/CLAUDE.md` updated to reflect the split.
- The audit repo remains public and readable to anyone in the org — no change there.

**Linked to:**
- ADR-011 (operating model; this ADR amends the audit-authorship aspect only)
- `handoffs/lovable-production-db-change.md` (the workflow that triggers dev-authored entries)
- `pinned/team-roles.md → Tool access matrix` and `→ Authority`
- `pinned/kb-hygiene.md → Three-repo architecture` and `→ Who owns what`

---

### ADR-013: Flagship surfaces — CSC workflow + Client Portal + Vivacity Academy; EOS reclassified {#adr-013}
**Date:** 2026-05-15
**Status:** Decided — describes current product framing
**Decided by:** Carl Simpao (project lead + KB owner), in conversation with the user surfacing the framing shift

**Context:** The KB has positioned EOS Level 10 as "the flagship" since ADR-006 (2025) and the original orientation.md framing. That call was correct when EOS was the most distinctive new module and the product was smaller. As of `<codebase>@d240b112` (2026-05-15), the staff sidebar carries seven sections (`WORK`, `CLIENTS`, `EOS`, `RESOURCE MANAGEMENT`, `ADMINISTRATION`, `ACADEMY BUILDER`, `SYSTEM CONFIG`), the `CLIENTS` section alone has eight items spanning the full CSC workflow, the `/client/*` portal has ~14+ surfaces, and Vivacity Academy ships role-specific learner views plus a Professional Development Plan module (May 2026).

The disconnect surfaced when the user pointed at the `CLIENTS` section ("Manage Clients" with 407 tenants, CSC load distribution, risk levels) and "Manage Documents" (575 docs) and said *this* is the flagship — together with the Client Portal and Vivacity Academy. EOS is what Vivacity uses to run *itself*; it is not on the path between Vivacity and its clients.

**Decision:** Reframe the product narrative as follows.

- **Three flagship surfaces** (consultant- or client-facing, saleable, on the renewal path):
  1. **CSC workflow** — staff `CLIENTS` section. The Client Success Consultant's daily workspace.
  2. **Client Portal** — the `/client/*` surfaces. What client RTOs see and do.
  3. **Vivacity Academy** — the learning offering to client RTO staff (courses + PDP + Academy Builder).
- **One internal operating system**: **EOS Level 10**, in the staff `EOS` section. Vivacity runs itself on EOS; client-tagged outputs reach clients via consultant-mediated surfaces, not direct EOS access. EOS remains load-bearing and fully shipped — it is simply not a flagship in the "what we sell" sense.

This reframing is documentation-only. No code changes. ADR-006 (EOS Level 10 as a first-class product surface) is **amended, not superseded**: EOS retains its first-class implementation, ownership, and engineering investment — what changes is its narrative position relative to the three client-facing flagships.

**Reasoning:**
- **Honesty over inertia.** Saying "EOS is the flagship" today undersells the consultant + client + academy surfaces and misroutes prioritisation conversations. New readers form expectations that don't match where Vivacity actually invests review and rollout discipline.
- **Prioritisation clarity.** When trading off scope, flagship-vs-internal is the right axis. CSC workflow regressions affect every active engagement; EOS regressions affect Vivacity's own meeting cadence. Both matter, but the impact paths differ — and the KB should make that visible.
- **Onboarding alignment.** The first thing a non-technical reader (new hire, external reviewer) needs to know about Unicorn is what it does for clients. CSC workflow / Client Portal / Academy answers that; "EOS Level 10 is the flagship" does not, unless you already know the company runs itself on EOS.
- **Reflects the navigation.** Seven sidebar sections with `CLIENTS` second only to `WORK` (the consultant's personal inbox) is the product team's revealed preference. The KB framing should match the UI surface area.

**Alternatives considered:**
- **Keep "EOS is the flagship."** Rejected — undersells what the product actually does for paying clients. Persisting the old framing makes the KB silently wrong over time, the same failure mode ADR-011 was written to avoid.
- **Add a fourth flagship line for EOS.** Rejected — flattens the distinction. EOS does not have the same client-facing impact path as the other three, and treating it as parallel hides the real signal.
- **Drop "flagship" terminology entirely.** Rejected — the team uses the word, and the alternative ("priority module") is vaguer. Keep the term; sharpen what it means.
- **Wait for a full architecture rewrite.** Rejected — the framing is wrong *today*, and the cost of a small surgical reframe is much lower than letting the wrong frame compound in onboarding and decisions.

**Risks accepted:**
- **EOS investment may look deprioritised.** Mitigation: explicit "internal operating system" framing carries weight — Vivacity's own cadence depends on it, and ADR-006's first-class implementation commitments stand. The summary matrix line in `module-status.md` calls this out directly.
- **Three flagships is one more thing to remember than one flagship.** Mitigation: the surfaces are already three distinct nav areas in the UI (CLIENTS, /client/*, Academy); the framing maps to what readers will see in the running app.
- **"Flagship" is value-laden.** Some readers may infer that non-flagship modules are second-class. Mitigation: §15 (Integrations), §17 (Resource Hub) etc. continue to carry status indicators independent of flagship framing.

**Consequences:**
- `pinned/orientation.md` — "What is novel about 2.0" replaced with the three-flagship framing; "What's live" reordered to lead with flagship surfaces, then internal operating system, then supporting modules + integrations.
- `pinned/glossary.md` — added **CSC**, **CSC workflow**, **Flagship surface**, **Internal operating system**.
- `codebase-state/architecture.md` — new "Product overview — flagship surfaces" section at top, including the seven-section sidebar map.
- `codebase-state/module-status.md` — new "Flagship surfaces" section at top; §3 (EOS) reclassified from "the flagship feature" to "Vivacity's internal operating system"; §6 (Client Portal) and §16 (Academy) labelled as Flagships #2 and #3 respectively.
- **ADR-006 amended, not superseded.** EOS Level 10 remains a first-class product surface implementation-wise. What changes is its narrative position relative to the client-facing flagships.
- **For prioritisation:** when planning trades scope between EOS and CSC workflow / Client Portal / Academy work, the default should be to protect the flagships unless EOS work has a specific identified client-impact path.

**Linked to:**
- ADR-006 (EOS Level 10 as a first-class product surface; amended)
- `pinned/orientation.md → Flagship surfaces`
- `codebase-state/architecture.md → Product overview — flagship surfaces`
- `codebase-state/module-status.md → Flagship surfaces`
- `pinned/glossary.md` (CSC, CSC workflow, Flagship surface, Internal operating system)

---

### ADR-014: Hand-written code moved to a standing branch+PR discipline — amends ADR-011's "no gate for hand-written code" claim {#adr-014}
**Date:** 2026-09-01
**Status:** Decided — describes current reality
**Decided by:** recorded during the codebase optimization program (`docs/kb/reference/codebase-optimization-plan-2026-08-28.md`), correcting several pinned docs found describing a stale model

**Context:** ADR-011 (2026-04-27) accurately described its own moment: no peer review at any layer, Lovable pushing schema + frontend direct to `main`, and — for hand-written code — "lands on feature branches and merges via PR — also without mandatory review," framed as symmetric with Lovable's lack of process. `pinned/team-roles.md` similarly stated Claude Code is "forbidden from writing to `<codebase>/`... regardless of who's running it," and `pinned/orientation.md`'s ground rule 3 repeated the "also without mandatory review" framing. By 2026-09-01 the codebase repo's own `AGENTS.md` (the cross-tool rulebook, read natively by Claude Code, Cursor, and Codex) had established real, standing discipline for hand-written changes that none of those three pinned/reference docs reflected: direct git hotfix (a hand-written change on a branch, opened as a PR) is the *standing default path*, not a symmetrically-unreviewed fallback; there is no path to `main` except merging a PR; merging always requires a fresh, explicit in-session ask (a standing "yes" from an earlier session never carries forward); force-push, branch/tag deletion without confirmation, and amending pushed commits are all explicitly forbidden; branch-naming conventions (`hotfix/<slug>`, `chore/<slug>`) are defined and followed.

**Decision:** This ADR amends — does not supersede — ADR-011. ADR-011's description of **Lovable's** direct-to-main, no-review behavior stands unchanged; that part of the operating model hasn't moved. What's superseded is the *symmetry claim* for hand-written code: hand-written changes (via Claude Code or any dev) now go through a standing branch+PR process with an explicit merge gate, and Claude Code is not forbidden from writing to the codebase — the opposite is true, it's the default path for hand-written changes.

**Reasoning:**
- **The gate is real, not aspirational.** Unlike ADR-011's finding that review claims in the pre-2026-04-27 KB didn't match practice, the branch+PR discipline in `AGENTS.md` is the actual, currently-followed process for hand-written changes — verified against the merge history of this optimization program itself (every PR in Phase 0 and Phase 1 followed exactly this path).
- **Three pinned/reference docs had drifted from source, not from each other.** `pinned/team-roles.md`, `pinned/orientation.md`, and (by omission) this ADR all still described the 2026-04-27 snapshot. `AGENTS.md` is the actual current source of truth for write permissions per the KB's own source-precedence rules (codebase wins over KB when they disagree) — this ADR just makes that explicit in the decision trail rather than leaving readers to notice the contradiction unassisted.
- **Consistent with ADR-011's own stated purpose.** ADR-011 exists specifically so "a KB that describes a process the team doesn't follow" doesn't stay wrong silently. Leaving the "no gate for hand-written code" claim uncorrected once it became false would repeat exactly the failure ADR-011 was written to stop.

**Alternatives considered:**
- **Edit ADR-011 in place.** Rejected — ADR-011 was accurate when written; editing it would erase real decision history and the KB's own convention (established by ADR-012 and ADR-013) is to amend via a new ADR, not rewrite old ones.
- **Leave it uncorrected pending a full Phase-1 KB regeneration pass.** Rejected — the specific factual claim ("Claude Code forbidden") is wrong *today* and actively misleading if a reader acts on it; the cost of a small, scoped amendment is much lower than letting a wrong permission claim compound.

**Risks accepted:**
- **This ADR itself can go stale** if `AGENTS.md`'s branch/PR/merge rules change again. Mitigation: none beyond the KB's standing reconsider-by discipline — future readers should verify against current `AGENTS.md`, not treat this ADR as permanently authoritative on the exact mechanics.

**Consequences:**
- `pinned/team-roles.md` — the `<codebase>/` access line corrected to describe the current branch+PR path instead of "forbidden."
- `pinned/orientation.md` — ground rule 3 corrected to describe the current standing discipline for hand-written code, while leaving the Lovable-direct-to-main description (still accurate) unchanged.
- **For onboarding:** new readers should expect hand-written code changes (via Claude Code or any dev) to always go through a branch, a PR, and an explicit merge ask — never a direct push to `main` — while Lovable's own push behavior remains the separate, unreviewed path ADR-011 described.

**Linked to:**
- ADR-011 (operating model; this ADR amends the hand-written-code-gate aspect only, not the Lovable-direct-to-main aspect)
- `AGENTS.md → Write permissions & branch naming` (the actual current rules this ADR describes)
- `pinned/team-roles.md → Tool access matrix`
- `pinned/orientation.md → Ground rules`

---

### ADR-015: Preserve broad internal-staff tenant read access as the RBAC compatibility baseline {#adr-015}
**Date:** 2026-09-09
**Status:** Decided for the current baseline; future portfolio scope remains open
**Decided by:** Carl

**Context:** The current database helper `has_tenant_access_safe` grants broad
cross-tenant access to active internal Vivacity staff, while the RBAC v6 plan
has not yet established whether staff read access should follow assigned
portfolios. The Phase 3 lifecycle pilot needs a stable compatibility baseline,
but it must not silently narrow existing operational access or turn assignment
into an authorization boundary. The P7 evidence packet records Super Admin
and CSC as the priority characterization personas, not as newly approved
capability bundles.

**Decision:** Preserve broad internal-staff tenant **read** access for now.
Scope sensitive actions separately by explicit capability, target scope, and
relationship. This is a compatibility baseline for characterization and
read-only/shadow work; it does not authorize a production policy migration,
change any RLS helper, or approve future portfolio/assignment scope.

**Boundaries:**
- Job roles remain defaults, not permissions or tenant scope by themselves.
- Super Admin and CSC remain the first baseline personas; current lifecycle
  route behavior is unchanged (Super Admin allowed, CSC denied).
- Any future narrowing of staff read access requires a separate
  Carl/Vivacity decision, workflow evidence, and an explicit migration plan.
- Sensitive writes, destructive operations, exports, privilege administration,
  and cross-tenant controls remain subject to their own capability and
  hard-Super-Admin/delegation decisions.

**Alternatives considered:**
- **Move all staff immediately to assigned portfolios.** Rejected for now —
  current behavior is broad and the assignment relationship is not yet a
  proven authorization boundary; an immediate narrowing could create silent
  operational lockouts.
- **Leave the baseline unspecified.** Rejected — Phase 3 characterization
  needs an explicit compatibility assumption so a shadow result is
  interpretable and cannot accidentally become a policy choice.

**Consequences:** The RBAC vocabulary packet can use broad internal-staff
read as its current baseline while keeping the final staff-scope decision
open. No code, schema, RLS, grant, Edge, or production-data change follows
from this ADR. The decision must be revisited before any v6 cutover that
narrowly scopes staff reads.

**Linked to:**
- [RBAC/Tenant decision evidence packet](codebase-optimization/phase-3/p7-rbac-tenant-decision-evidence.md)
- [RBAC v6 authorization plan](rbac-v6-authorization-implementation-plan-2026-09-01.md)
- [Phase 2.6 progress log](codebase-optimization/phase-2-6-stabilization/progress-log.md)

---

### ADR-016: RBAC authority, role, delegation, and AJ/CSC pilot baseline {#adr-016}
**Date:** 2026-09-09
**Status:** Decided baseline; implementation remains separately authorized
**Decided by:** Carl

**Context:** RBAC v6 is still an implementation plan. Current frontend route
guards, database helpers, and Edge gates do not form a single capability
catalogue, while internal staff currently retain broad tenant access. Phase 3
needs a stable vocabulary and bounded pilot contract without silently changing
production authorization behavior.

**Decisions:**

1. The server-side decision core is authoritative. RLS, RPCs, and Edge
   Functions enforce server-side checks; React guards are UX-only. Unknown or
   missing context, inactive principals, and evaluator errors fail closed.
2. Super Admin covers governance, security, system configuration, and approved
   cross-tenant controls. CSC covers client coordination and approved
   package/stage/Academy workflows. Other seats remain unassigned until their
   responsibilities are validated; no permissions are inferred from a title.
3. High-risk authorization, privilege, system-configuration, destructive
   tenant, cross-tenant export, and audit-administration actions remain
   Super Admin-only for now. Routine CSC elevation is a future possibility,
   not a grant made by this ADR.
4. CSCs retain standing portfolio-wide access. A temporary elevated grant may
   be used for a named package/stage capability or similar exceptional action;
   high-risk changes require a second approver, ordinary narrow changes may
   use one approver, and self-approval is prohibited. Grants record rationale,
   scope, approver, and expiry.
5. Elevated grants expire after 30 days for high-risk actions or 90 days for
   ordinary operational actions, with quarterly review and explicit renewal.
6. The AJ Delostrico pilot is limited to the assigned active-client portfolio
   and explicitly named package/stage create/edit plus approved Academy
   actions. Delete, bulk, publish/archive, assignment, and cross-portfolio
   actions are excluded.
7. Disabled or archived users fail closed, have sessions revoked promptly,
   and require approved administrator recovery. An unavailable account-state
   check is an access-unavailable condition, not an allow.
8. Carl/Vivacity owns quarterly access-review policy; a named Operations
   delegate prepares the evidence. Reviews cover roles, grants, expirations,
   and exceptions.
9. `unicorn-qa` and the existing P2-QA persona suite are the standing
   disposable verification process. Verification is read-only against QA and
   must not create, mutate, or seed production data.
10. Shadow observation lasts 14 days before any authority cutover, with zero
    unexpected v6-only allows, zero unexplained legacy-allow/v6-deny
    lockouts, and review of every mismatch.
11. Internal staff retain portfolio-wide messaging access. Main-consultant and
    assistant relationships provide routing and audit context but do not
    silently narrow that standing access. Academy-only client users receive
    only explicitly named Academy communications, not ordinary broadcasts.

**Consequences:** These are characterization and migration-gate decisions,
not a production policy change. The capability catalogue, exact approval
workflow, break-glass model, person-picker/system-account classification, and
tenant-less-user disposition remain open. Any implementation affecting
schema, RLS, RPC, Edge enforcement, or production data requires a separate
authorized PR and applicable audit record.

**Linked to:**
- [RBAC/Tenant decision evidence packet](codebase-optimization/phase-3/p7-rbac-tenant-decision-evidence.md)
- [RBAC v6 authorization plan](rbac-v6-authorization-implementation-plan-2026-09-01.md)
- [Phase 2.6 progress log](codebase-optimization/phase-2-6-stabilization/progress-log.md)

---

### ADR-017: Tenant status/lifecycle/access vocabulary — three-axis model, single authoritative writer {#adr-017}
**Date:** 2026-09-10
**Status:** Decided baseline; implementation remains separately authorized
**Decided by:** Carl

**Context:** Tenant Operating Model §18 item 2 asked for the authoritative
meanings and allowed transitions for `tenants.status`, `lifecycle_status`,
and `access_status`. Live inspection (all 415 tenants, current
`origin/main`) found the drift the plan warned about is real, not
theoretical, and traced it to a concrete root cause rather than just
inconsistent vocabulary:

- Two independent, uncoordinated writers exist. `TenantStatusDropdown.tsx`
  is the only frontend writer of `status` (options sourced from
  `dd_status`); a `BEFORE UPDATE` trigger (`sync_tenant_lifecycle_status`)
  then derives `lifecycle_status` from it, but the derivation's `CASE` has
  no mapping for `status` values `inactive`, `archived`, or `completed` —
  setting status to any of those three leaves `lifecycle_status` stale.
  Separately, the SuperAdmin-gated `tenant-lifecycle` Edge Function sets
  `lifecycle_status`/`access_status` directly for suspend/archive/close/
  reactivate actions and never touches `status` at all. Neither path knows
  about the other. Zero RPC functions write any of the three columns
  (confirmed via `pg_get_functiondef` search across `public`), so these two
  paths are the entire write surface.
- A concrete, fixable defect surfaced along the way: every Edge-Function-
  driven lifecycle transition writes `client_audit_log` twice — once
  correctly from the Edge Function's own `writeAuditLog()` (real actor),
  once from the DB trigger `trg_tenant_lifecycle_audit`, which fires on the
  same `UPDATE` regardless of caller and logs `actor_user_id = auth.uid()`
  — `NULL` for Edge Functions, which authenticate as `service_role`.
- Live distribution: dominant `inactive`/`suspended`/`disabled` (320 of
  415), `active`/`active`/`enabled` (54), several smaller legitimate
  combinations, plus known-bad rows (`In Arears` typo, 2 occurrences) that
  predate this decision.

**Decision:**

1. Adopt the plan's three-axis target semantics: commercial/service status
   (customer-facing, preserved as-is), lifecycle state (canonical active/
   suspended/closed/archived state machine), and access state (independent
   auth/application enablement).
2. Consolidate to one authoritative writer for all three columns together
   (extend `tenant-lifecycle` or an equivalent single RPC/Edge contract),
   replacing the implicit trigger-derivation with an explicit, complete
   transition table. The current dropdown-writes-`status`-only /
   Edge-writes-lifecycle-only split is retired as part of this migration,
   not preserved alongside a new layer.
3. Historical/typo raw values (`In Arears`, etc.) are not retroactively
   remapped as part of this decision — that is a separate, bounded
   data-cleanup task once the new write path exists.
4. The duplicate-audit-log-row defect is approved as an independent,
   isolated bug fix — it does not need to wait on items 1-2 above.

**Reasoning:** The vocabulary ambiguity is a symptom; the actual defect is
that no single code path owns tenant-state transitions, so the two
existing writers silently diverge. An explicit transition table owned by
one writer is more robust than an implicit trigger `CASE` that has already
demonstrated it silently misses new/changed status values (three status
values it doesn't handle today) — the same failure class as the April
status-filter incident this plan was written to prevent from recurring.

**Alternatives considered:** Patching the trigger's `CASE` to add the
missing `inactive`/`archived`/`completed` mappings without consolidating
writers was rejected — it would fix today's specific gap but leaves the
same drift-by-construction risk (two writers, no shared contract) for the
next new status value or the next new lifecycle action.

**Risks accepted:** Consolidating writers is a real code change to an
active production path (tenant suspend/archive/close/reactivate, plus the
routine status dropdown) and needs its own scoped implementation plan,
transition-table review, and Playwright verification before it ships —
this ADR authorizes the direction, not a migration or deployment.

**Consequences:** TOM §18 item 2 is closed as a policy question. Items
3-13 remain open. The single-writer consolidation and the audit-log fix
are each separately authorized implementation work, not authorized by this
ADR alone — normal branch/PR/verification/audit-entry rules apply per
`AGENTS.md`.

**Linked to:**
- [Tenant Operating Model plan, §18 item 2](tenant-operating-model-data-architecture-plan-2026-09-02.md#18-decisions-carlvivacity-must-approve)
- [Tenant Operating Model plan, §5.5 lifecycle vocabulary drift](tenant-operating-model-data-architecture-plan-2026-09-02.md#55-lifecycle-vocabulary-drift)

---

### ADR-018: `tenants.id` ratified as the canonical key; `id_uuid` mandatory for external integration contracts {#adr-018}
**Date:** 2026-09-10
**Status:** Decided baseline; implementation remains separately authorized
**Decided by:** Carl

**Context:** Tenant Operating Model §18 item 3 asked whether `tenants.id` is
the long-term canonical internal key, with `id_uuid` an integration-safe
identifier, or whether a future key migration is required. The plan (§7.1)
already carried an interim working stance to this effect; this ADR ratifies
it as policy rather than a provisional default.

Live evidence (all 415 current tenants, current `origin/main`): every
tenant has `id_uuid` populated; only 2 of 415 have a legacy `unicorn1_id`;
411 of 415 have `id != import_id` (a legacy import sequence that diverged
from the real key early on and is not itself a candidate key). Spot-checked
against the internal Vivacity staff tenant (`id = 6372`, `id_uuid =
8575ea84-3155-4acc-8197-344fb05adf67`, `import_id = 319`, `unicorn1_id =
NULL`) — the same shape as the aggregate evidence.

**Decision:**

1. `tenants.id` (bigint) remains the canonical internal key. No key
   migration to UUID-as-primary is planned or justified by current
   evidence.
2. `id_uuid` is the integration-safe external identifier. Every future
   integration contract (new external system connection, import, or
   sync — not internal reporting/joins) must expose and consume
   `id_uuid`, never bare `id`, with no exceptions carved out case-by-case.
3. New contracts must expose one named canonical ID and, where integration
   needs it, one explicitly named external UUID — never an ambiguous
   generic `id` variant (per §7.1, now ratified rather than provisional).

**Reasoning:** Nothing in the live evidence (no partitioning pressure, no
cross-system collision risk, no performance complaint tied to key type)
argues for a UUID-primary migration — that would be a large, high-blast-
radius change solving a problem that doesn't exist in this data. Making
`id_uuid` mandatory for integrations (rather than optional/ad hoc) closes
off the exact ambiguous-generic-`id` drift the evidence above already shows
(`import_id`, `unicorn1_id` as parallel, inconsistently-populated
identifiers).

**Alternatives considered:** Leaving `id_uuid` usage on integrations
optional/discretionary was rejected — that is the same pattern that
produced the current drift across `import_id`/`unicorn1_id`/`id_uuid`, just
one identifier later.

**Risks accepted:** None beyond normal implementation risk — this ratifies
an already-observed-safe default rather than changing behavior.

**Consequences:** TOM §18 item 3 is closed as a policy question. Items 4-13
remain open. Any new integration contract that skips `id_uuid` in favor of
bare `id` is a conformance gap against this ADR, not a judgment call.

**Linked to:**
- [Tenant Operating Model plan, §18 item 3](tenant-operating-model-data-architecture-plan-2026-09-02.md#18-decisions-carlvivacity-must-approve)
- [Tenant Operating Model plan, §7.1 bounded source-of-truth model](tenant-operating-model-data-architecture-plan-2026-09-02.md#71-bounded-source-of-truth-model)

---

## Decisions still needing ADRs

| Decision | Why write it up | Priority |
|---|---|---|
| Stripe webhook handling — Edge Function vs. n8n | Blocking subscription module | High |
| LLM provider(s) for `ai-generate-suggestions` | Undocumented tribal knowledge | Medium |
| Whether AI audit features from sibling project are in scope | Roadmap clarity | Medium |
| Client portal architecture — dedicated surface vs role-filtered admin | Affects routing, component reuse | Medium |
| Campaign engine — build vs buy vs defer | Affects `send-automated-email` question | Medium |
| Lovable environments / staging strategy | Release discipline | Medium |
