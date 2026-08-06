# Migration Map — Unicorn 1.0 → 2.0

> **Last updated:** 2026-04-23 · **Reconsider by:** 2026-07-23 · **Confidence:** medium — "Unicorn 1.0" is a loose label for the legacy stack; exact migration provenance per row needs validation with RJ. Data model reference (added 2026-04-23) is grounded in the legacy table diagram and needs RJ confirmation on a few flagged items.
>
> Tracks what came from the legacy stack, what's been dropped, and what's net-new.
> "Unicorn 1.0" is used loosely to mean the pre-2.0 operating stack: the legacy Vivacity CMS + Keap + OnceHub + spreadsheets. Different parts had different levels of "system-ness."

---

## The legacy stack (what we're moving away from)

| System | What it did | Where we are |
|---|---|---|
| Legacy Vivacity CMS (internal) | Contact + client management; consultant tracking | Replaced conceptually by Unicorn 2.0 tenants + users + EOS |
| Keap | CRM, pipeline, email broadcasts, campaign automation | Replacing — contacts/pipeline done, campaigns deferred |
| OnceHub | Booking / scheduling with clients | Partially superseded — EOS meetings scheduled natively; general booking still open |
| Spreadsheets (Rocks, Scorecard, V/TO) | EOS tracking by hand | **Fully replaced by native EOS Level 10 module** |
| Google Sheets (audits) | Ad-hoc audit templates | Replaced by Audits module (lighter scope than sibling Vivacity project) |

---

## Unicorn 1.0 data model reference

Source: legacy table diagram at `docs/legacy/Unicorn_Table_Diagram.vsdx` (Visio). This section captures the shape of the 1.0 schema so KB readers don't have to open the file. Row counts are from the diagram snapshot — they're indicative, not current.

### Core entity tree

The 1.0 model is structured around a **template → instance** fan-out anchored on `package_instances` and `stage_instances`:

```
users · tenants · packages · stages
                                   └─► package_stages (171)
tenants ─┐
users ───┼─► package_instances (1003)
         │       └─► stage_instances (5990)
                            ├─► client_task_instances  (22,444) ─► client_tasks  (227)
                            ├─► staff_task_instances   (69,200) ─► staff_tasks   (460)
                            ├─► email_instances        (12,965) ─► emails        (285)
                            └─► document_instances    (103,100) ─► documents     (721)
```

Plus a notes side-branch: `notes` (9,842) splits into `client_notes` and `package_notes` and (per a diagram annotation) **can link to either a tenant or a package_instance** — i.e. polymorphic parent.

Document metadata sidecar: `(dd_)document_categories` (20), `(dd_)fields` (24), `document_fields` (2377). The `dd_` prefix marks data-dictionary / lookup tables.

### The template → instance pattern

Every operational artifact in 1.0 (tasks, emails, documents) splits into:
- a **template** table (canonical definition, low row count, often global or tenant-scoped) — `client_tasks`, `staff_tasks`, `emails`, `documents`
- an **instance** table (per-stage materialisation, FK to `stage_instances`, high row count) — `client_task_instances`, `staff_task_instances`, `email_instances`, `document_instances`

The fan-out ratio is the operational shape of the business: ~150× for staff tasks, ~143× for documents, ~45× for emails. Any historical-data import has to preserve this split or reporting/lifecycle hooks will not compose.

2.0 is following this pattern for packages → `package_stage_instances` (per [11-codebase-map.md](11-codebase-map.md)). Whether tasks/emails/documents in 2.0 carry the template/instance split forward in the same shape is **not yet confirmed** — verify with RJ before any historical import.

### Key foreign keys (from the diagram)

- `packages.id → package_instances.package_id`
- `tenants.id → package_instances.tenant_id`
- `users.uuid → package_instances.manager_id`
- `users.id → package_instances.client_id` — **bigint, not UUID** (annotated "FROM unicorn1 (int8)")
- `users.id → package_instances.clo_id` — **bigint, not UUID** (also annotated "FROM unicorn1 (int8)")
- `package_instances.id → stage_instances.packageinstance_id`
- `stage_instances.id → {client_task,staff_task,email,document}_instances.stageinstance_id`
- `*_instances.{thing}_id → {thing}.id` (instance → template)

The two `int8` annotations are the migration-bridge problem: 1.0 used bigint user IDs; 2.0 uses Supabase UUIDs. See [Data migration](#data-migration) below.

### Features in 1.0 not yet in 2.0

Drawn from comparing this diagram against [04-module-status.md](04-module-status.md) and [11-codebase-map.md](11-codebase-map.md). **For the Dave meeting** — these are the candidate gaps to discuss for porting:

| 1.0 capability | 2.0 status | Notes for the meeting |
|---|---|---|
| Polymorphic notes (`client_notes` / `package_notes`, can link to tenant OR package_instance) | 🟡 Partial — `/tenant/:id/notes` exists; polymorphism not confirmed | If clients had notes attached to *engagements* (package_instances), not just to themselves, that's a UX/data shape that hasn't been ported. |
| Email template + instance split (`emails` → `email_instances` per stage) | 🟡 No template/instance split confirmed | 2.0 has per-purpose senders (`send-stage-email`, etc.) but no equivalent of the `email_instances` history-of-sends-per-stage that the 1.0 row counts imply. Does the team need stage-level email history? |
| Document template + instance split (`documents` → `document_instances` per stage) | 🟡 Partial | 103k document instances in 1.0. SharePoint suite in 2.0 covers generation/delivery (`deliver-governance-document`, `provision-tenant-sharepoint-folder`, etc.), but the per-stage instance ledger is unconfirmed. Without it, reporting on "what doc was delivered for which stage of which engagement" is hard. |
| Staff task / client task distinction (separate `staff_tasks` and `client_tasks` tables in 1.0) | ✅ Tasks shipped — but **structural change** | 2.0 appears to have unified to a single tasks model. Confirm that staff vs. client semantics are preserved by role/scope rather than table separation, and that no 1.0 reporting depends on the table split. |
| Stage-task auto-completion / pipeline automation | 🔲 Not started | Already flagged in [04-module-status.md → Packages / Pipeline Stages](04-module-status.md#5-packages--pipeline-stages). 1.0 row counts (5990 stage instances driving 22k+ task instances) suggest this was load-bearing. |
| Polymorphic-parent linking (note links to either tenant or package_instance) as a general pattern | 🔲 Not confirmed in 2.0 | If 2.0 needs anything to attach to either a tenant or an engagement, the pattern question matters across modules (notes, attachments, comments). |
| `dd_` data-dictionary tables — central reference data | ✅ Equivalent partial — `/manage-categories`, `/manage-fields` exist | Confirm 2.0 covers everything the 20 categories + 24 fields covered in 1.0, or if some lookup data was dropped. |

This list is the diagram-derived gap list. There may be additional 1.0 features that are not represented in the table diagram (UI-only features, integrations, automations) — those need a separate audit.



### ✅ Replaced

| 1.0 surface | 2.0 surface | Notes |
|---|---|---|
| Keap contacts | `users` + `tenant_members` + tenant detail pages | Contact history depth TBD |
| Keap opportunities/pipeline | `packages`, `package_stages`, `package_stage_instances` | Auto-stage automation not yet in this codebase |
| Keap broadcast emails | Mailgun templates + `send-invitation-email` | Transactional only; campaign UI still to decide |
| OnceHub (EOS meeting scheduling) | `/eos/calendar` + `generate-meeting-recurrence` | EOS context only |
| Legacy CMS user management | `/manage-users` + invite flow | Full auth system rebuilt |
| EOS spreadsheets | Full EOS Level 10 module | Huge upgrade — now a product |
| Ad-hoc audits | Audits module (templates, workspace, findings, actions, report) | Simpler than sibling Vivacity build |

### 🟡 Partially replaced

| 1.0 surface | Status | Blocker |
|---|---|---|
| Keap tags | Not clear whether tag model exists | No tagging schema visible |
| Keap custom fields | `/manage-fields` exists — scope unclear | Confirm parity |
| Keap campaign builder | Not built | Open decision: build vs buy vs defer |
| OnceHub (non-EOS booking) | Not built | Open decision: is this needed in 2.0? |
| Contact activity history | Unclear scope | Confirm with RJ |

### 🔲 Not started in 2.0

| 1.0 surface | Status | Urgency |
|---|---|---|
| Subscription management (Superhero, Academy) | Not started — no Stripe code | High for revenue |
| Keap email automation sequences | Not started | Medium |
| General-purpose booking | Not started | Medium |
| ~~Microsoft/Outlook calendar sync~~ | ✅ **Shipped** — `sync-outlook-calendar` + full addin suite live | — |
| ~~SharePoint integration~~ | ✅ **Shipped** — full SharePoint function suite live (browse, import, link, provision) | — |

---

## Net new in 2.0 (no 1.0 equivalent)

These didn't exist in any legacy system — they're pure additions.

| Capability | Where |
|---|---|
| **EOS Level 10 Meeting module** | `/eos/*` — flagship feature |
| Real-time live meeting sync | `useMeetingRealtime` + Supabase channels |
| Quarterly Conversations workflow | `/eos/qc`, `/eos/qc/:id` |
| Client-facing EOS view | `/client/eos` — client RTOs see their tagged Rocks/Issues |
| training.gov.au org lookup | `search-organisations`, `get-organisation-details` |
| Compliance audit workspace | `/audits/*` |
| AI suggestion hooks | `ai-generate-suggestions`, `useAISuggestions` |
| Multi-tenant invite flow with role matrix enforcement | `invite-user` edge function |
| Package stage instance model | `packages` + `package_stages` + `package_stage_instances` |
| RTO tips library | `/rto-tips` |

---

## Migration phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation: auth, tenants, RLS, invite flow | ✅ Complete |
| 1 | Core CRM: contacts, tenant mgmt, packages/stages, documents | ✅ Largely complete |
| 2 | EOS Level 10 module | ✅ Complete |
| 3 | Audits & Assessments (scoped version) | ✅ Shipped |
| 4 | Super Admin / Admin tooling polish | 🟡 Active (recent commits) |
| 5 | Subscription / membership (Stripe) | 🔲 Not started — blocked on decisions |
| 6 | Campaign engine (if in scope) | 🔲 Open |
| 7 | Calendar integrations (Outlook/Google) | ✅ Outlook shipped. Google: 🔲 not started |
| 8 | SharePoint integration | ✅ Shipped |
| 9 | AI automation expansion (beyond suggestions) | 🔲 Open |

---

## What was considered and explicitly dropped

| Feature | Why dropped |
|---|---|
| Third-party ESP for transactional (Resend, Postmark) | Mailgun was the existing account |
| OnceHub for EOS meeting scheduling | EOS needed tight lifecycle integration |
| Ninety.io / Bloom Growth for EOS | Would have fragmented client data |
| Direct LLM calls from frontend | Security + auditability |

---

## Data migration

- Contacts from Keap / legacy CMS → `users` + `tenants` + `tenant_members`
- EOS data (V/TO, Rocks, Scorecard) from spreadsheets → EOS tables (manual import expected; spec is the contract)
- Package data from legacy → `packages`, `package_stages` seed
- Audit templates from Google Sheets → audit template seed ([sql-setup/08-audit-question-bank-seed.sql](../sql-setup/08-audit-question-bank-seed.sql))

If you're given a bulk-import task, check [sql-setup/](../sql-setup/) first — the pattern is SQL seed files, not a GUI importer.

### Unicorn 1.0 user ID bridge (open)

The 1.0 schema used **bigint** user IDs. 2.0 uses Supabase **UUIDs**. The legacy table diagram annotates `package_instances.client_id` and `package_instances.clo_id` as "FROM unicorn1 (int8)" — meaning those FKs still reference the legacy bigint space.

Any historical-data import that touches `package_instances` (or any other table with these FKs) needs a `unicorn1_user_id (int8) → user_uuid` lookup table — either as a column on `users` or as a side mapping table.

**Status:** Not confirmed whether 2.0 already has such a bridge column on `users`. Verify before scoping any 1.0 → 2.0 data port. Likely places to check: `supabase/migrations/` for any column named `unicorn1_id`, `legacy_id`, `unicorn1_user_id`, etc.; the `import-unicorn1-client` / `lookup-unicorn1-client` / `search-unicorn1-users` edge functions (per [01-architecture.md](01-architecture.md#edge-functions-117-live)) may already encode the lookup pattern.

---

## Relationship to the sibling Vivacity project

A separate Vivacity Supabase project also carries the "Unicorn 2.0" name and informed several of the ADRs in this KB. Key differences between that project and this one:

| Aspect | Sibling project | This project |
|---|---|---|
| Audits | 3-phase lifecycle, AI report gen, SharePoint, Outlook sync | Simpler module, no AI report gen (yet) |
| Email | `send-automated-email` v63 multi-handler | Per-purpose edge functions (invite only for now) |
| RLS helpers | `is_vivacity_team_safe()`, `has_tenant_access_safe()` | `is_vivacity()`, `is_superadmin()`, `current_tenant()` |
| AI agents | Six named agents (Alex, Casey, etc.) in n8n | Not present |
| EOS module | Not mentioned | **Flagship feature** |
| Stripe | Not wired | Not wired (same) |
| pg_cron | Multiple live jobs | Not yet deployed |

**Treat the inherited docs as useful historical context and convention references, not as an accurate description of this codebase.** When in doubt, read the code.
