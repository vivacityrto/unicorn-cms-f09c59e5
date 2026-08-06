# Glossary

> **Last updated:** 2026-05-15 · **Reconsider by:** 2027-04-23 · **Confidence:** high — vocabulary is stable; add terms when new ones appear in code or conversation. 2026-05-15: added CSC, Flagship surface, and Internal operating system per ADR-013.
>
> Vocabulary reference for Unicorn 2.0: EOS, compliance/RTO, and product-internal terms.
> If you don't know a term, it's probably here. If it's not, add it.

---

## EOS (Entrepreneurial Operating System)

EOS is the business operating methodology from Gino Wickman's book *Traction*. Unicorn 2.0 implements it natively. The EOS Level 10 module is the biggest subtree in `src/`.

| Term | Meaning |
|---|---|
| **EOS** | Entrepreneurial Operating System. A management framework with six components: Vision, People, Data, Issues, Process, Traction. |
| **V/TO** | Vision/Traction Organizer. A one-page strategic plan capturing core values, focus, 10-year target, 3-year picture, 1-year plan, and quarterly priorities. See `/eos/vto`. |
| **Rocks** | 90-day priorities. Each team member owns ~3 Rocks per quarter. See `/eos/rocks`. |
| **Scorecard** | Weekly metrics dashboard — 5 to 15 numbers tracked weekly to spot issues before they become problems. See `/eos/scorecard`. |
| **Level 10 Meeting (L10)** | Weekly synchronous meeting with a fixed 90-minute agenda: Segue, Scorecard, Rock Review, Customer/Employee Headlines, To-Do Review, IDS, Conclude. See `/eos/meetings`. |
| **IDS** | Identify, Discuss, Solve. The method used inside Level 10 Meetings to work through issues. |
| **Issues List** | Running list of organisational issues / blockers awaiting resolution. See `/eos/issues`. |
| **To-Dos** | Weekly action items generated from IDS or assigned ad-hoc. 7-day due date by default. See `/eos/todos`. |
| **Accountability Chart** | The EOS alternative to an org chart — defines roles and their seats, not people. |
| **Quarterly Conversation (QC)** | 1:1 between a manager and direct report; structured 5-question format; sets up the next quarter's Rocks. See `/eos/qc`. |
| **Same Page Meeting** | Quarterly leadership alignment meeting (not yet a distinct surface in Unicorn 2.0 — may be subsumed by QC). |
| **Client-tagged** | Rock or Issue that's owned in service of a specific client RTO. Appears in `/client/eos` for that tenant. |
| **Headlines** | Short positive updates shared in a Level 10 (Customer Headlines, Employee Headlines). |

---

## Compliance / RTO

Australian vocational education compliance context. Vivacity's client base is RTOs and CRICOS providers.

| Term | Meaning |
|---|---|
| **RTO** | Registered Training Organisation. An Australian training provider registered with ASQA (or a state regulator) to deliver nationally recognised qualifications. |
| **ASQA** | Australian Skills Quality Authority. The national regulator for the VET sector. |
| **CRICOS** | Commonwealth Register of Institutions and Courses for Overseas Students. A separate registration for delivering to international students. |
| **CHC audit** | "Compliance Health Check" — Vivacity's annual compliance audit product. |
| **Mock audit** | Simulation of a real regulator audit. |
| **Combined audit** | CHC + CRICOS in one engagement. |
| **Due diligence audit** | Pre-acquisition or partnership compliance review. |
| **training.gov.au** | Official registry of Australian training providers and qualifications. Unicorn 2.0 queries it via `search-organisations` and `get-organisation-details`. See [docs/training-gov-au-integration.md](../docs/training-gov-au-integration.md). |
| **TAS** | Training and Assessment Strategy. A document RTOs must maintain per qualification they deliver. "TAS Builder" appears in legacy docs as a possible feature — not in this codebase. |
| **Audit template** | Structured question bank for an audit type (CHC, Mock, CRICOS, Combined, Due Diligence). 5 templates live, 395 questions total. |
| **Finding** | An observation from an audit — typically non-conformance or partial conformance. |
| **Corrective action** | The remediation required for a finding. |
| **Evidence** | Documents uploaded to substantiate answers during an audit. |

---

## Product-internal terminology

| Term | Meaning |
|---|---|
| **Vivacity** | The consultancy that owns Unicorn. Tenant ID `6372`. |
| **Tenant** | An organisation account in Unicorn. Every business-domain row is scoped to a tenant. |
| **Tenant 6372** | The magic ID. Hardcoded as the Vivacity staff tenant (`VIVACITY_TENANT_ID = 6372` in `invite-user/index.ts` and exported from `useVivacityTeamUsers.tsx`). |
| **Vivacity staff** | Users belonging to tenant 6372. Roles: Super Admin, Team Leader, Team Member. Can access all tenants via `is_vivacity()` in RLS (or `is_vivacity_internal` column check in edge functions). |
| **Client / Client RTO** | A tenant other than 6372. Roles: Admin, User. Access scoped to own tenant by default. |
| **`tenant_members`** | Platform RBAC membership table. Roles: `Admin` / `General User`. Has `status` (active/inactive/pending), `invited_at`, `joined_at`. Used for auth checks, billing signals, seat limits, and AI feature gates. Created as part of the RBAC Model migration; backfilled from `users.tenant_id`. Referenced in RLS SELECT policies. |
| **`tenant_users`** | Client-side contact/membership table. Roles: `parent` (can manage) / `child` (read-only). Has `primary_contact` and `secondary_contact` booleans (auto-set by trigger when `role = 'parent'`). Used for client management UI, email delivery, document generation, invite-user flow, and M365 provisioning. Not the same as `tenant_members` — both tables exist and serve distinct purposes. |
| **Unicorn 1.0** | The legacy operating stack being replaced: old Vivacity CMS + Keap + OnceHub + spreadsheets. Not a single codebase. |
| **Unicorn 2.0** | This codebase. The rebuild — React + Supabase, EOS-first. |
| **Sibling project** | A separate Vivacity Supabase project that also carries the "Unicorn 2.0" name but has different edge functions, module scope, and RLS helper names. Historical context only — not this codebase. |
| **Package** | A product offering (e.g. CHC audit engagement, EOS implementation service) that a client subscribes to. |
| **Package Stage** | A phase within a package (e.g. "Onboarding", "Delivery", "Review"). |
| **Package Stage Instance** | A client's progress through a specific stage of their package. |
| **Wrapper** | A page component variant (e.g. `ManageUsersWrapper`) that handles layout + auth chrome around a pure page component. Routed from `App.tsx`. |
| **Lovable** | The AI-assisted UI builder hosting the frontend. Connected to the GitHub repo. UI-layer only — schema goes through RJ. |
| **Awesomate** | Australian-hosted n8n — the automation layer target. Referenced in sibling-project docs; not currently wired into this codebase. |
| **CLO** | Compliance Lead Officer. A Vivacity staff role that owns the compliance work for a client engagement. Appears in Unicorn 1.0 as `package_instances.clo_id` (bigint, see [migration-1to2.md → Unicorn 1.0 user ID bridge](../reference/migration-1to2.md#unicorn-10-user-id-bridge-open)). Confirm with RJ how CLO assignment is modelled in 2.0 — it may be encoded via `unicorn_role` + tenant membership rather than a dedicated FK. |
| **CSC** | Client Success Consultant. The Vivacity staff role that owns a client portfolio end-to-end. Visible in the `CLIENTS` section as the **CSC Load** widget — clients are assigned to a CSC (Samantha, Sharwari, AJ, Angela, Kelly, Ezel, etc.) with an unassigned bucket for unrouted tenants. CSCs work primarily out of the **CSC workflow** flagship surface. |
| **CSC workflow** | The staff sidebar's `CLIENTS` section — Flagship #1. Where CSCs run their portfolio: client list, packages, documents, communications, support tickets, RTO tips, compliance auditor, audits. See [orientation.md → Flagship surfaces](orientation.md) and [ADR-013](../reference/decision-trail.md#adr-013). |
| **Flagship surface** | A product surface that Vivacity sells and that clients consume. Unicorn 2.0 has three: CSC workflow, Client Portal, Vivacity Academy. Distinguished from **internal operating system** (EOS) which Vivacity uses to run itself but does not sell. ADR-013 (2026-05-15) is the framing decision. |
| **Internal operating system** | A product surface that supports Vivacity's own operations but is not exposed to clients as a product. EOS Level 10 is the canonical example — Vivacity runs itself on EOS, client-tagged outputs flow through CSC workflow contexts, but client RTOs have no direct EOS access. Distinguished from **flagship surface**. |
| **`dd_` prefix** | Data-dictionary / lookup table prefix from Unicorn 1.0 (e.g. `dd_document_categories`, `dd_fields`). Marks low-row-count reference tables. The 2.0 equivalents live behind `/manage-categories` and `/manage-fields`. |

---

## Stack vocabulary

| Term | Meaning in this repo |
|---|---|
| **shadcn-ui** | The component library in `src/components/ui/`. Owned-source Radix primitives with Tailwind. |
| **RLS** | Row Level Security. Postgres feature used for all tenant isolation. See [conventions.md](conventions.md#rls). |
| **Edge Function** | A Deno-based TypeScript function deployed on Supabase's infrastructure. Used for anything requiring server-side privilege or external API calls. |
| **Service role** | A Supabase API key that bypasses RLS. Used in edge functions. Must never be exposed to the frontend. |
| **pg_cron** | Postgres extension for scheduled jobs. ✅ Deployed in this project — extension enabled in migration `20260209232822` and one job confirmed: `seed-compliance-tasks-nightly` runs daily at 2am AEST. |
| **Realtime channel** | A Supabase Postgres changes subscription over WebSocket. Used for live meeting sync. |
| **Query key** | react-query cache identifier. Convention: `[domain, subentity, ...args]`. |
| **Template / Instance** | A modelling pattern inherited from Unicorn 1.0: a low-row-count "template" table (e.g. `documents`, `emails`) paired with a high-row-count "instance" table (e.g. `document_instances`, `email_instances`) that materialises the template per stage / engagement. See [conventions.md → Template → instance pattern](conventions.md#template--instance-pattern-inherited-from-unicorn-10) and [migration-1to2.md → Unicorn 1.0 data model reference](../reference/migration-1to2.md#unicorn-10-data-model-reference). |

---

## Acronyms not covered elsewhere

| Abbrev | Meaning |
|---|---|
| AEST | Australian Eastern Standard Time |
| ADR | Architecture Decision Record (see [decision-trail.md](../reference/decision-trail.md)) |
| CLO | Compliance Lead Officer (see Product-internal terminology) |
| RLS | Row Level Security |
| RPC | Remote Procedure Call (here: Postgres function invoked via Supabase) |
| JWT | JSON Web Token (Supabase auth sessions) |
| L10 | Level 10 Meeting (EOS) |
| DKIM/SPF | Email authentication protocols (Mailgun config) |
| FK | Foreign Key |
| CRUD | Create, Read, Update, Delete |
| MVP | Minimum Viable Product |
