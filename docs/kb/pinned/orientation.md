# Start Here — Unicorn 2.0

> **Last updated:** 2026-05-15 · **Reconsider by:** 2026-11-15 · **Confidence:** medium-high — flagship reframing 2026-05-15 (ADR-013) shifts the headline from "EOS is the flagship" to "CSC workflow + Client Portal + Vivacity Academy is the flagship," with EOS reclassified as Vivacity's internal operating system. Tenant ID verified in codebase; team-roles section rewritten 2026-04-27 in seat-centric restructure; ground rules updated 2026-04-27 to reflect operating-model ADR-011; non-technical reader sections added 2026-04-27; audit authorship updated 2026-04-28 per ADR-012.
>
> Shared orientation for the Unicorn 2.0 engineering team. Product overview, mental model, ground rules, and key landmarks. Read this before diving into any other KB file.

---

## What is Unicorn 2.0?

**One-line:** A multi-tenant React + Supabase platform that runs Vivacity's compliance-consulting business end-to-end — clients, pipeline, weekly EOS meetings, quarterly conversations, RTO compliance audits.

**Scope of this KB.** Vivacity has two products: Unicorn (this codebase) and ComplyHub (separate; not covered here). The GitHub org name `ComplyHub-ai` reflects the company, not a product-specific scope. If you're looking for ComplyHub docs, this isn't the place.

**Who uses it:**
- **Vivacity staff** (tenant ID `6372`) — consultants working across many client RTOs. Roles: Super Admin, Team Leader, Team Member.
- **Client RTOs** (every other tenant) — Australian Registered Training Organisations consuming compliance services. Roles: Admin, User.

**Who it replaces:**
- Unicorn 1.0 / legacy Vivacity CMS (internal CRM)
- Keap (contacts, pipeline, campaign automation)
- OnceHub (booking — partially superseded, see [migration-1to2.md](../reference/migration-1to2.md))
- Ad-hoc spreadsheets for EOS meeting tracking

**Flagship surfaces — what Unicorn 2.0 sells and what clients consume:**

The product has three flagship surfaces, all consultant- or client-facing. EOS (below) is internal operating infrastructure, not the flagship.

1. **CSC workflow** — the `CLIENTS` section of the staff sidebar. Where Client Success Consultants run their client portfolio end-to-end: client list with CSC load and risk levels, packages, document libraries (~575 docs), communications, support tickets, RTO tips, compliance auditor, audits. See [DashboardLayout.tsx:38-48](../src/components/DashboardLayout.tsx#L38-L48).
2. **Client Portal** — the `/client/*` surfaces. What client RTOs see: home dashboard, documents, resource hub, calendar, notifications, reports, and (admin only) team management. ~14+ surfaces, all RLS-gated to the client's own tenant. See [DashboardLayout.tsx:125-143](../src/components/DashboardLayout.tsx#L125-L143).
3. **Vivacity Academy** — the learning platform for client RTO staff. Role-specific course views (Trainer, Compliance Manager, Governance Person, SSO, Administration Assistant), certificates, assessments, events, community, and the **Professional Development Plan (PDP)** — a Standards-anchored evidence and reflection cycle that satisfies SRTO 2025 §3.1/3.2/3.3 and the Credential Policy CPD obligations. Vivacity staff manage content via a dedicated Academy Builder.

**Where EOS Level 10 fits.** Vivacity runs *itself* on EOS — V/TO, Rocks, Scorecard, Issues (IDS), To-Dos, Accountability Chart, live Level 10 meetings, Quarterly Conversations. It's a first-class product surface but an **internal operating system**, not a saleable surface. EOS-tagged client items appear in CSC workflow contexts ("Client Impact"), but client RTOs do not access EOS directly. See [docs/EOS_LEVEL10_SPECIFICATION.md](../docs/EOS_LEVEL10_SPECIFICATION.md) for the authoritative spec and [reference/decision-trail.md#adr-013](../reference/decision-trail.md#adr-013) for the flagship reframing rationale.

---

## Who is this KB for

This KB is shared across audiences. Where to go next depends on which seat you sit in (see [team-roles.md](team-roles.md) for the four seats):

- **Engineering team members** (Devs, Project lead + KB owner, Product owner) — read this file end-to-end. Then [conventions.md](conventions.md) for patterns, [team-roles.md](team-roles.md) for tool access, and [reference/](../reference/) as work demands.
- **Non-technical KB readers** (new hires before commit access, external reviewers / consultants, deep-reading partners) — read the "What is Unicorn 2.0?" section above and "Who's who" further down. Skip the technical sections in between. See "Reading guide for non-technical readers" near the end of this file for what to read in other docs and what this Claude Project will and won't do for you.

---

## Stack in one glance

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + shadcn-ui + Tailwind (built in Lovable) |
| Data fetching | `@tanstack/react-query` (global `QueryClientProvider` in [src/App.tsx](../src/App.tsx)) |
| Forms | `react-hook-form` + `zod` schema validation |
| Animations / DnD | `framer-motion`, `@dnd-kit/*` |
| Backend | Supabase — Postgres + RLS + Auth + Storage + Edge Functions + Realtime |
| Email | Mailgun via edge functions (templates in [templates/mailgun/](../templates/mailgun/) and [supabase/email-templates/](../supabase/email-templates/)) |
| Automation | n8n now, migrating to Awesomate (Australia-hosted). Stripe not yet wired. |

---

## Mental model

Three concepts unlock 80% of the codebase:

### 1. Tenancy
Every business-domain row has a `tenant_id`. Tenant `6372` is Vivacity — staff. All other tenants are client RTOs. A user belongs to one tenant via `tenant_members`; Vivacity Super Admins can switch active tenant via `set_active_tenant()`.

### 2. Two distinct UI surfaces
- **Admin / consultant surface** — Vivacity staff sidebar with seven sections: `WORK`, `CLIENTS` (the CSC workflow flagship), `EOS`, `RESOURCE MANAGEMENT`, `ADMINISTRATION`, `ACADEMY BUILDER`, `SYSTEM CONFIG`. Visibility is role-aware (Super Admin / Team Leader / Team Member). See [DashboardLayout.tsx](../src/components/DashboardLayout.tsx).
- **Client surface** — client RTO views under `/client/*` (Home, Documents, Resource Hub, Calendar, Notifications, Reports, Team) plus the Academy learner surface. Clients have **no EOS access** — EOS is Vivacity-internal.

They share UI primitives but render entirely different navigation and data based on `unicorn_role` + `tenant_id`. See [flow-patterns.md](../reference/flow-patterns.md#role-aware-rendering).

### 3. RLS is the security boundary
All tenant isolation happens at the database layer via Postgres RLS. The frontend never enforces access control — it reads what RLS lets it read. This is non-negotiable. See [conventions.md](conventions.md#rls) and [decision-trail.md](../reference/decision-trail.md#adr-005) for the failure modes that make this rule hard.

Helper functions (Postgres):
- `is_vivacity()` → true if current user belongs to tenant 6372
- `is_superadmin()` → true if current user's `unicorn_role = 'Super Admin'`
- `current_tenant()` → the user's active tenant for this session

> **Note:** Edge functions do NOT call `is_vivacity()` directly — they check the `is_vivacity_internal` boolean column on the `users` table, or the `is_vivacity_staff` RPC. The `is_vivacity()` function is used in RLS policies only.

---

## Where to look first

| If you're looking for… | Go to… |
|---|---|
| Entry point / routes | [src/App.tsx](../src/App.tsx) |
| Auth state | [src/hooks/useAuth.tsx](../src/hooks/useAuth.tsx) |
| Supabase client | [src/integrations/supabase/client.ts](../src/integrations/supabase/client.ts) |
| Edge functions | [supabase/functions/](../supabase/functions/) |
| Schema seeds | [sql-setup/](../sql-setup/) |
| Migrations | [supabase/migrations/](../supabase/migrations/) |
| EOS spec | [docs/EOS_LEVEL10_SPECIFICATION.md](../docs/EOS_LEVEL10_SPECIFICATION.md) |
| Invite error codes | [docs/INVITE_USER_DIAGNOSTICS.md](../docs/INVITE_USER_DIAGNOSTICS.md) |

Full navigational map: [codebase-map.md](../codebase-state/codebase-map.md).

---

## Ground rules (non-negotiable)

1. **AI logic → server only.** Never in the frontend. Edge Functions or n8n.
2. **New tables require the three-step RLS ritual.** Tenant-read SELECT policy + staff ALL policy + `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Skipping any one is a silent failure. See [conventions.md](conventions.md#new-table-checklist).
3. **Lovable owns schema in practice.** Lovable users (Angela, Dave, Khian — see `team-roles.md`) push schema migrations alongside frontend code direct to `main`. There is no pre-merge review or sign-off gate. The three-step RLS ritual (item 2 above) is the *correct* technical pattern, but enforcement is post-merge — see `reference/decision-trail.md → ADR-011` for the operating-model rationale and risk acceptance. Hand-written code via Claude Code lands via PR on a feature branch (also without mandatory review).
4. **Edge functions validate the caller manually.** Always `supabase.auth.getUser(callerToken)` then check `unicorn_role` / `tenant_id`. The service-role key bypasses RLS, so the function is the only enforcement point.
5. **Column defaults are not enough.** For NOT NULL columns the frontend may explicitly set to `NULL`, add a coercion trigger. See [decision-trail.md](../reference/decision-trail.md#adr-008).
6. **Configuration belongs to data, not code.** Any selectable
   option, type, status, category, or classification that a Super
   Admin could ever want to change without developer help must live
   in a `dd_` prefixed database table — not hardcoded in the
   frontend, a TypeScript enum, or a CHECK constraint. Developers
   build features. Super Admins configure them. See
   `conventions.md → dd_ tables — user-manageable lookup values`.
   (Dave direction, April 2026.)

---

## Who's who

The team is organised around four **seats** (responsibilities), not titles. The same person may sit in multiple seats. See `pinned/team-roles.md` for full seat definitions, tool access, and handoff routing.

| Person | Seats |
|---|---|
| Angela | Product owner + Dev |
| Carl | Project lead + KB owner + Dev |
| Dave | Dev |
| RJ | Dev (works mostly on ComplyHub) |
| Khian (Brian) | Dev — junior, growing scope |

**Seat summary:**
- **Product owner** (Angela) — owns Unicorn the product; final say on what ships.
- **Project lead + KB owner** (Carl) — engineering direction; KB stewardship; sole author for reconciliations and remixes (devs author Lovable prod DB change sessions; see `team-roles.md`); Lovable remix trigger.
- **Dev** — feature implementation, almost entirely through Lovable; no peer review or sign-off gates today.
- **Non-technical KB reader** (no current named occupants) — read-only seat for new hires before access, external reviewers, deep-reading internals.

---

## What's live (May 2026) — `unicorn-cms-f09c59e5`

Headlines below are ordered with the three flagship surfaces first, then supporting modules, then integrations. EOS is reclassified as the internal operating system (load-bearing, but not a flagship — see [reference/decision-trail.md#adr-013](../reference/decision-trail.md#adr-013)).

### Flagship surfaces

**CSC workflow (CLIENTS section)** — flagship #1. The Client Success Consultant's daily workspace: a client list (~407 tenants in production) with CSC load distribution, risk levels, anniversaries, packages, and registration end dates; per-client packages, document libraries (~575 docs across ~21 categories), communications, support tickets, RTO tips, compliance auditor (AI-assisted), and audits. Drives the consulting business. See [DashboardLayout.tsx:38-48](../src/components/DashboardLayout.tsx#L38-L48) for the nav surface and [module-status.md#flagship-surfaces](../codebase-state/module-status.md#flagship-surfaces) for build status.

**Client Portal (`/client/*`)** — flagship #2. What client RTOs experience: Home dashboard, Documents, Resource Hub (categorised compliance library), Calendar, Notifications, Reports, and — for tenant admins — Team management. ~14+ surfaces, all RLS-gated to the client's own tenant. EOS is intentionally absent — clients consume EOS-tagged outputs (e.g. Client Impact rollups) through their consultant, not through their own portal. See [DashboardLayout.tsx:125-143](../src/components/DashboardLayout.tsx#L125-L143) and [docs/client-portal/data-access-checklist.md](../docs/client-portal/data-access-checklist.md).

**Vivacity Academy** — flagship #3. The learning offering to client RTO staff. Five role-specific learner surfaces (Trainer, Compliance Manager, Governance Person, Student Support Officer, Administration Assistant), courses, lessons, assessments, certificates, events, community. The **Professional Development Plan (PDP)** module — shipped May 2026 — anchors development goals to SRTO 2025 Standards, captures lesson reflections + manager reviews + CPD evidence, and surfaces a workforce dashboard for tenant admins and Vivacity Super Admins. Vivacity staff build content via the **Academy Builder** (`/superadmin/academy/*`); seat access gating is RLS-enforced. Stripe billing not yet wired. See [module-status.md#16-academy](../codebase-state/module-status.md#16-academy) and [#18-academy-pdp](../codebase-state/module-status.md#18-academy--professional-development-plan-pdp).

### Internal operating system

**EOS Level 10 Meeting module** — Vivacity's internal operating system, not a saleable flagship. Implements EOS methodology end-to-end: Mission Control (V/TO), Rocks, Flight Plan, Scorecard, Risks & Opportunities, Issues (IDS), To-Dos, live multi-participant Level 10 Meetings, Quarterly Conversations, GWC Trends, Rock Analysis, Client Impact, Accountability Chart. The largest subtree in `src/components/`. Client RTOs do not access EOS directly; consultant-facing client items appear in CSC workflow contexts. See [module-status.md#3-eos-level-10-meeting-module](../codebase-state/module-status.md#3-eos-level-10-meeting-module) and [reference/decision-trail.md#adr-006](../reference/decision-trail.md#adr-006).

### Platform & supporting modules

**Audits module** — Runs Vivacity's compliance audit engagements (CHC, Mock, CRICOS, Due Diligence) against a 395-question bank; staff log findings, assign corrective actions, and generate reports with AI-assisted document analysis. The **AI audit stack** (April 2026) adds RAG-grounded finding drafts, evidence analysis, and executive summaries against an SRTO 2025 / National Code / ESOS corpus. Lives in the `CLIENTS` section. See [module-status.md#4-audits--assessments](../codebase-state/module-status.md#4-audits--assessments).

**Multi-tenant user management** — Invite, role-assign, and manage users within any tenant. Covers the full invite-to-onboard flow, Super Admin password resets, and bulk actions across Vivacity and client roles. See [module-status.md#1-auth--user-management](../codebase-state/module-status.md#1-auth--user-management).

**Tenant / client management** — Powers the CSC workflow flagship: per-client workspace with details, team members, documents, notes, tasks, engagement timeline, and impact metrics. See [module-status.md#2-tenants--multi-tenancy](../codebase-state/module-status.md#2-tenants--multi-tenancy).

**Package / pipeline stages** — Models Vivacity's service offerings as Packages with ordered stages; tracks each client's stage-instance progress with a health monitor, phase-completeness calculator, and a duplicate-stream guard preventing two RTO/CRICOS/GTO packages on the same tenant. See [module-status.md#5-packages--pipeline-stages](../codebase-state/module-status.md#5-packages--pipeline-stages).

**Resource Hub** — A categorised library of compliance documents, templates, checklists, and guides. The staff-facing surface lives in the `RESOURCE MANAGEMENT` section (Templates Manager, Checklists Manager, Registers & Forms Manager, Audit & Evidence Library, Training & Webinar Library, Guides & How-To, CI Tools, Updates Log Manager); the client-facing surface is part of the Client Portal flagship. See [module-status.md#17-resource-hub](../codebase-state/module-status.md#17-resource-hub).

**AI layer** — 40+ server-side functions routed through a central `ai-orchestrator`: compliance assistant chat, document analysis, vector knowledge search, research intelligence, evidence gap checks, predictive risk scoring, and the AI audit stack (RAG + Gemini 2.5 Pro). AI logic is server-only (edge functions). See [module-status.md#14-ai--automation](../codebase-state/module-status.md#14-ai--automation).

### Integrations

**Outlook calendar sync + addin suite** — Syncs EOS meeting events to Microsoft Outlook; the addin functions let staff capture emails, log meeting notes, and draft time entries without leaving Outlook. See [module-status.md#15-integrations](../codebase-state/module-status.md#15-integrations).

**SharePoint integration** — Browse a client's SharePoint, import or link documents into Unicorn, and provision structured SharePoint folders for new clients. See [module-status.md#15-integrations](../codebase-state/module-status.md#15-integrations).

**Microsoft 365 / Graph email** — Sends pipeline stage and consultant-composed emails via Microsoft Graph (bypassing Mailgun), and provisions M365 accounts for new client users. See [module-status.md#15-integrations](../codebase-state/module-status.md#15-integrations).

**ClickUp integration** — Bidirectional task and time sync between Unicorn and ClickUp, plus bulk CSV import for migrating ClickUp-heavy clients. See [module-status.md#15-integrations](../codebase-state/module-status.md#15-integrations).

**TGA / training.gov.au integration** — Queries the national training register to search, import, and keep RTO organisational records current — used at client onboarding and during compliance engagements. See [module-status.md#15-integrations](../codebase-state/module-status.md#15-integrations).

**RTO Tips / Tasks / Settings / Notifications** — Four lightweight modules. RTO Tips serves quick-reference compliance content to client RTOs (lives in `CLIENTS` section); Tasks provides global and tenant-scoped task lists; Settings covers user profile, team config, and integration credentials; Notifications runs an in-app alert outbox pipeline. See [module-status.md#10-rto-tips](../codebase-state/module-status.md#10-rto-tips), [#8-tasks](../codebase-state/module-status.md#8-tasks), [#11-settings](../codebase-state/module-status.md#11-settings).

## What's NOT live (don't assume it is)

- Stripe / subscriptions — not wired. `MembershipDashboard` exists but no Stripe. See [module-status.md](../codebase-state/module-status.md).
- `generate-audit-report` — not found in codebase; confirm with RJ
- The six named AI agents (Alex, Casey, Morgan, Jordan, Riley, Sam) — not confirmed as named entities (many AI functions exist but agent naming is unclear)

---

## Reading guide for non-technical readers

If you're in the **Non-technical KB reader** seat (new hires before commit access, external reviewers / consultants, deep-reading partners), here's what to read and what to skip across the rest of the KB.

| File | What to read |
|---|---|
| `pinned/orientation.md` (this file) | Top through "Who's who" and "What's live"; skip the engineering Onboarding checklist and Standing questions |
| `pinned/team-roles.md` | "Seats" section and "People → seat mapping" — these tell you who the team is and what each seat does. Skip the tool access matrix and handoff routing unless curious. |
| `pinned/glossary.md` | Browse as needed — useful when terminology is unfamiliar |
| `pinned/decisions.md` | The one-line index; ADR titles tell the story |
| `pinned/conventions.md` | Read the "Scope of these conventions" intro for context. Everything else assumes engineering context — skip. |
| `pinned/kb-hygiene.md` | Useful for understanding how the KB itself works and is maintained |
| `reference/decision-trail.md` | ADR-011 (operating model) and ADR-006 (EOS as product surface) are the most context-rich. Skip the rest unless a specific decision number comes up. |
| `reference/cadence.md`, `reference/flow-patterns.md`, `reference/migration-1to2.md` | Skip — engineering operations and patterns |
| `reference/brainstorm-log.md` | Optional — raw thinking from the team |
| `codebase-state/*` | Skip — code-state docs |
| `handoffs/non-technical-proposal.md` | Read this if you have a proposed change to the KB |
| Other `handoffs/*.md` | Skip — engineering procedures |

### What this Claude Project will and won't do for you

The Claude Project (this chat interface, accessed through claude.ai) is set up to answer questions about Unicorn from the KB and the codebase.

**You can ask:**
- "What is X?" / "How does X work?" / "Where is X in the codebase?"
- "Who owns Y?" / "Why was Z decided?"
- "Walk me through the [module/flow/decision]"

**It won't:**
- Commit to repositories on your behalf — writes happen via Claude Code, which non-technical readers don't have access to.
- Run reconciliations, post-Lovable-remix rituals, or audit-trail entries — KB owner only (Carl).
- Make engineering decisions for you — Claude can lay out tradeoffs and surface context, but the seat with authority still has to make the call.
- Generate code that lands in the codebase — Lovable does that for the team.

If you have a proposed change to the KB, see [handoffs/non-technical-proposal.md](../handoffs/non-technical-proposal.md).

---

## Onboarding checklist (for new team members)

- [ ] Run the app locally. Login as a Vivacity Super Admin; hop into a client tenant via the switcher.
- [ ] Read [architecture.md](../codebase-state/architecture.md) end-to-end.
- [ ] Skim every file in [src/pages/](../src/pages/) — names map directly to product surfaces.
- [ ] Read one edge function front-to-back: [supabase/functions/invite-user/index.ts](../supabase/functions/invite-user/index.ts). It's the canonical service-role pattern.
- [ ] Read [docs/EOS_LEVEL10_SPECIFICATION.md](../docs/EOS_LEVEL10_SPECIFICATION.md) — EOS is Vivacity's internal operating system. For the flagship product framing (what Unicorn 2.0 sells and what clients consume), see the **Flagship surfaces** section above and [reference/decision-trail.md#adr-013](../reference/decision-trail.md#adr-013).
- [ ] Open [module-status.md](../codebase-state/module-status.md) and identify which modules are 🟡 partial — these are the highest-value areas to contribute to.
- [ ] Ask Carl which open decisions in [decisions.md](decisions.md#open-decisions) are actively blocking work.

---

## Standing questions to always ask

When a decision feels implicit or invisible, it probably *was* implicit. Surface it to Carl and capture it in [decisions.md](decisions.md). This codebase has a history of implicit decisions biting later (RLS incidents, NULL coercion, naming divergence). When in doubt, write it down.
