# RBAC v6 — Packet P1-e: bundled-verb decomposition

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-b draft classification](p1-b-draft-classification.md), [P1-c sequencing worksheet](p1-c-capability-enforcement-sequencing.md), [P1-d static enforcement ledger](p1-d-static-enforcement-ledger.md), [P1-d machine ledger](data/p1-d-static-enforcement-ledger.json)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** source-backed preparation delivered 2026-09-12; reconciled 2026-09-15 for the three "Candidate only" rows named in R2-a's safe-unattended-work scope (`staff.addin.use` upgraded to source-backed, `admin.email_templates.manage` clarified against live RLS, `admin.tenant_users.manage` re-confirmed unchanged); Carl resolved all five R2-a review-ask questions 2026-09-15 (see "Review-ask resolutions" below) — vocabulary approved, hard-SA lock list set, owners assigned, first vertical slice approved as `eos.scorecard.manage`, and tenant/resource/relationship semantics assigned for all 18 rows (verified against current source, not just inferred — see "Tenant/resource/relationship semantics"); role defaults, grants, and enforcement cutover remain separately gated
> **Source:** `origin/main@214368f173e126636f1d2aa21c6c0493a7f5dba8` (2026-09-15 reconciliation additionally checked `origin/main@72909032e810582177ad666f59a524c29fba2331` and live `pg_policies` on `public.email_templates`; the same-day review-ask resolution additionally checked live code for `staff.ai.use`, `staff.meetings.use`, `staff.research.use`, `admin.vector.manage`, and `admin.system_config.manage`'s actual tenant-scoping)
> **Owner:** RBAC v6 with product/security review required for target semantics
> **Audit entry:** none needed — repository analysis only; no permission, role, grant, RLS, Edge, credential, or production change

## Purpose and boundary

R2-a authorized a static decomposition of the 18 active feature rows whose
names end in `manage` or `use`. The current names are not safe policy units:
several combine reads, writes, role changes, destructive actions, external
side effects, or machine-principal work under one capability. This packet
records the smallest action families evidenced by current callers and names
the gaps where the repository does not expose a live caller that can support
a stronger conclusion.

The candidate names below are a review vocabulary, not new feature keys. This
packet does **not** alter the permission catalogue, role defaults, grants,
RLS, RPCs, Edge gates, routes, or UI behavior. It also does not assert that a
candidate is currently enforced. The full raw source and Edge references
remain in the [P1-d JSON ledger](data/p1-d-static-enforcement-ledger.json).

## Method

For each bundled row I independently checked the current source on
`origin/main` using repository search and the referenced caller files. I
classified an action family only when one of these was visible:

1. a named UI handler or mutation hook with a concrete read/write effect;
2. a named Edge Function whose entry point or authorization call identifies
   the operation; or
3. a shared authorization helper whose only evidence is that a feature key is
   available, which is recorded as a boundary clue but **not** as proof of a
   live action.

Where a feature key is used by several unrelated Edge Functions, that is
recorded as evidence of over-broad current coupling rather than treated as a
single atomic operation. Where no live caller was found, the row remains
`needs_enforcement_inventory` and no action is inferred from its label.

## Candidate action vocabulary

These are the provisional action families used below. They intentionally reuse
the parent plan's preferred verbs without deciding final capability-key names:

| Candidate family | Meaning | Typical additional proof required |
| --- | --- | --- |
| `view` / `list` / `inspect` | Read or enumerate a resource/configuration | route, query/RPC, tenant/resource scope, denial case |
| `create` | Create a new resource or request | mutation boundary, target scope, duplicate/idempotency behavior |
| `edit` / `update` | Change an existing resource | target ownership/relationship, allowed fields, denial case |
| `delete` / `disable` / `revoke` | Remove, deactivate, or withdraw | destructive confirmation, audit, recovery/rollback |
| `assign` / `manage_access` | Change membership, role, access, or ownership | relationship proof and explicit product policy |
| `invite` / `resend` / `cancel` | Distinct invitation lifecycle transitions | recipient/tenant resolution and email side effect |
| `publish` / `apply` / `complete` | Make a configuration or artifact operational | state transition, downstream effects, rollback |
| `generate` / `sync` / `import` / `export` | Job, transfer, integration, or data movement | machine principal, external side effect, data sensitivity |
| `search` / `retrieve` / `share` | Search or expose data through a tool | source sensitivity, tenant binding, recipient boundary |

These families are not all appropriate for every row. In particular,
`manage_access`, export, system configuration, credential, and destructive
families require security review before delegation.

## Source-backed decomposition register

The “evidence” column gives representative current references; the P1-d JSON
ledger contains the complete resolved Edge reference list for rows with
`FeatureKeys.*` or literal feature-key calls.

| Existing feature row | Current source-backed surface | Provisional atomic action families | Disposition |
| --- | --- | --- | --- |
| `academy.tenant_access.manage` | `src/pages/superadmin/AcademyTenantAccessPage.tsx:43,57-70,157-176,252-286` gates tenant access and wires toggle, settings update, enrolment navigation, and package/course auto-enrol rule mutations | `view` tenant access state; `edit` access settings; `enable/disable` access; `manage_access` auto-enrol rules; `view` enrolment destination | Source-backed inventory complete; tenant scope and AJ/CSC pilot policy remain separate decisions. Tenant/resource semantics (2026-09-15): **per-tenant** — staff acting on one specific client tenant's Academy access config |
| `admin.team_users.manage` | User profile consumer at `src/pages/UserProfile.tsx:148`; Edge callers include `update-user-profile`, `update-user-role`, `toggle-user-status`, `delete-user`, `activate-ghost-user`, `invite-user`, `invite-or-reset-user`, `send-password-reset`, `send-magic-link`, `generate-recovery-link`, onboarding, import/sync, and token paths; full list is in P1-d JSON | `view/list` users; `edit` profile; `assign` role/relationship; `disable`; `delete`; `invite`; `resend/reset`; `activate legacy`; `generate credential/recovery link`; `send onboarding`; `import/sync`; `issue token` | Source-backed inventory complete; several high-risk or external-effect families must not inherit one shared grant. **Delegability decided 2026-09-15 (Carl), by sub-family, not the whole row:** credential/token issuance (`generate-recovery-link`, magic-link, password-reset, token issuance) is hard-Super-Admin-locked, no exceptions; destructive user/tenant actions (`delete-user`, `disable`, `activate-ghost-user`) are explicitly *not* hard-locked — delegable pending security review. Tenant/resource semantics: **mixed (D)** — profile edits are global-staff-admin, invite/onboarding sub-actions are per-tenant; can't get one answer until the row is actually split |
| `admin.tenant_users.manage` | Re-checked 2026-09-15: still no direct feature-key caller found in `src/` or `supabase/functions/` on the current source commit | Candidate only: `view/list` tenant users; `edit` membership/profile; `assign` relationship/role; `disable` | Unchanged — no stronger decomposition is justified; needs route/RPC/RLS and TOM relationship inventory. **Owner assigned 2026-09-15: RBAC v6 itself** (Carl's call, rather than handing to TOM) |
| `admin.invites.manage` | `bulk-send-invitations/index.ts:68`, `cancel-invite/index.ts:51`, `resend-invite/index.ts:117`, and `send-invitation-email/index.ts:152,184` | `invite/create`; `invite/bulk_send`; `resend`; `cancel`; `view/status`; `resolve recipient/tenant`; `send email` | Source-backed inventory complete; bulk send and email side effect need separate risk/scope treatment. Tenant/resource semantics (2026-09-15): **mixed (D)** — the same invite functions serve both internal-staff invites and client-tenant invites; needs a product call on whether these split by target population before scope can be assigned |
| `admin.email_templates.manage` | Re-checked 2026-09-15: still no CRUD caller uses this feature key. `src/pages/ManageEmailTemplates.tsx` (route `/admin/email-templates`, `src/routes/dashboardRoutes.tsx:644`) has no route-level `allowedRoles`/`PermissionGate` and its data hook `src/hooks/useEmailTemplates.tsx` has no `usePermission`/feature-key check at all — any authenticated user can reach the route. However, `public.email_templates` RLS (confirmed live via `pg_policies`) independently enforces `is_super_admin_safe()` for INSERT/UPDATE/DELETE and `is_super_admin_safe() OR is_vivacity_team_safe()` for SELECT — so there is no live write/read bypass, but the actual enforcement boundary for this resource is RLS, not the `admin.email_templates.manage` capability. `send-stage-email` remains the only confirmed consumer of the key itself | Candidate only, disposition clarified: `view`; `edit`; `publish/apply`; `delete/archive`; `send using template` | Not source-backed as a capability-gated CRUD row; template-admin RLS is the real boundary and should be modeled as its own row/relationship rather than assumed folded into this feature key. The route guard gap was fixed 2026-09-15 (`PermissionGate featureKey="admin.email_templates.manage"` on `/admin/email-templates`, PR #1311) as an interim measure. **Carl's decision 2026-09-15: retire this row; model email-template admin access as its own new row keyed directly to the RLS roles** (`is_super_admin_safe`/`is_vivacity_team_safe`) rather than continuing to use this feature key as a stand-in. Creating that replacement row is a follow-up packet, not done here |
| `admin.system_config.manage` | `pdp-auto-evidence/index.ts:186` and the P1-d Edge refs show the key guarding diagnostics, task creation, PDF/Excel/minutes generation, provisioning, regulator/research work, repair, TGA sync, and SharePoint upload (13 callers total, all confirmed via the P1-d ledger's `edge_gate_refs`) | `inspect`; `edit/apply` configuration; `generate/export`; `provision/external side effect`; `repair/migrate`; `sync/import`; `upload` | The current key is demonstrably over-broad; security review and per-function boundary tracing are required. **Hard-Super-Admin-locked, no exceptions (Carl, 2026-09-15).** Tenant/resource semantics verified 2026-09-15: mixed, not uniformly global — `tga-sync` resolves and acts on a caller-supplied `tenant_id`, while `repair-staff-uuids`/`regulator-watch-check` are global with no tenant reference. Same "needs decomposition before scope can be assigned per sub-action" problem as `admin.team_users.manage` |
| `admin.permissions.manage` | Shared mapping/test evidence plus `update-role-permission` Edge gate in the P1-d ledger | `inspect` roles/grants; `edit` role permission; `create/revoke` grant; `manage_access` defaults; `break_glass/audit` control | Only the permission-edit boundary is source-backed; never infer self-grant or break-glass authority. **Hard-Super-Admin-locked, no exceptions (Carl, 2026-09-15).** Tenant/resource semantics verified 2026-09-15: global, confirmed both via `update-role-permission` (zero tenant/client references) and the `role_permissions` table schema (no `tenant_id` column at all). **Confirmed golden 2026-09-15 (Carl) as R2-a's fourth vertical slice**: see [P1-z](p1-z-admin-permissions-manage-golden-matrix-draft.md) — its own enforcement primitive (`check_permission`/`is_super_admin_safe`) was independently found and fixed same-day for a disabled-account gap (see the linked audit entry there) |
| `admin.vector.manage` | P1-d Edge refs cover `vector-index-update`, `vector-index-remove`, `vector-index-rebuild`, embedding corpus/document functions, and FAQ generation; update/remove/rebuild bodies show vector-index delete/insert/log effects | `inspect`; `index/write`; `rebuild`; `remove/delete`; `generate embeddings`; `update`; `audit/log` | Source-backed inventory complete; destructive index removal/rebuild and machine/external work require security review. **Hard-Super-Admin-locked, no exceptions (Carl, 2026-09-15).** Tenant/resource semantics verified 2026-09-15: global, no per-tenant split — `generate-ask-viv-faqs` was checked directly and has zero tenant/client references, contrary to an earlier suspicion. **Scoped as R2-a's candidate fifth vertical slice 2026-09-15 but not yet drafted** — investigation of its consumer `vector-search` (a separate, related read-only capability, correctly out of scope for this row) led to finding and fixing the `verifyAuth` dead-account-status-check security bug instead (see `docs/audit-log/entries/2026-09-15-fix-verify-auth-dead-account-status-check.md`); drafting `admin.vector.manage`'s own golden-matrix packet (next available P1 letter, following the P1-w/x/y/z format) remains the next concrete RBAC v6 task |
| `admin.academy_mgmt.manage` | No direct feature-key caller found in `src/` or `supabase/functions/` on the checked source commit | Candidate only: `view`; `create/edit/delete` course; `publish`; `enrol`; `certificate`; `manage tenant/client access`; learner-data read/write | Needs Academy route, hook, RPC/Edge, and TOM/RBAC boundary inventory; do not infer from the label. **Owner assignment deferred 2026-09-15 (Carl):** Academy Solo is actively being implemented by a separate concurrent session — revisit once its pilot is stable rather than investigating in parallel |
| `clients.emails.manage` | `unlink-email/index.ts:11,30,55-184` checks the feature and performs email-link lookup, audit, update/delete operations | `view` linked emails; `link/create`; `edit`; `unlink/delete`; `send/compose`; `recipient selection`; `export/attachment` | `unlink/delete` is source-backed; other email-management families remain unverified and need messaging/privacy scope review. Tenant/resource semantics verified 2026-09-15: **per-tenant**, confirmed via `unlink-email`'s real `tenant_id`/`client_id` fields |
| `eos.configurations.manage` | `src/components/eos/configurations/EosConfigurationEditor.tsx:143,174-207,273-322,407-607` gates segment reorder/add/remove/edit and configuration settings; `src/pages/EosMeetings.tsx:33,35` reuses the key for agenda/configuration access | `view`; `create` segment; `edit` segment/settings; `reorder`; `delete` segment; `apply/publish` configuration; `manage meeting agenda` | Source-backed inventory complete; the configuration and meeting-agenda consumers may require separate resource/scope rows. Tenant/resource semantics verified 2026-09-15: **internal Vivacity-only** — confirmed zero tenant/client references in `EosConfigurationEditor.tsx`. Independently re-confirmed at the RLS layer same day (unlike the other two EOS rows, which had a real gap there): `eos_configurations`/`eos_configuration_segments` RLS routes through `has_permission('eos.configurations.manage','full')`, and `role_permissions` only has rows for internal `unicorn_role` values for this key — genuinely safe already, left unchanged. **Confirmed golden 2026-09-15 (Carl) as R2-a's third vertical slice**: see [P1-y](p1-y-eos-configurations-manage-golden-matrix-draft.md) — a fresh re-verification (not reused from this row) additionally swept the 5 `SECURITY DEFINER` functions referencing these tables for the `upsert_rock_with_parenting`-class write-bypass defect; none write to either table, so no RPC bypass exists here |
| `eos.rocks.own.manage` | `src/pages/EosRocks.tsx:81-175` gates own-rock creation path and routes create/edit/cascade handlers; child dialogs/hooks carry the actual mutations | `view` own rocks; `create` own rock; `edit` own rock; `complete/archive`; `view cascade`; `assign/team-create` if child flow permits | Source-backed entry-point inventory; own-resource relationship and team/company distinction need child-hook tracing. Tenant/resource semantics verified 2026-09-15: **owner-only**, confirmed via `EosRocks.tsx`'s `user_uuid`-based filtering; a team-wide view mode also exists (`userFilter === 'all'`), so visibility extends beyond strictly-own for viewing even though creation is owner-scoped. **Correction, same day:** the underlying `eos_rocks` table's RLS had the same client-tenant-reachable gap as `eos.scorecard.manage` (raw tenant-match clauses with no role check, plus a `client_tenant_id`-based grant on SELECT) — retired in the same migration, see [audit entry](../../../../audit-log/entries/2026-09-15-retire-client-eos-access.md). Owner-only semantics for internal Vivacity users are unaffected. **Correction, later the same day (child-hook tracing complete):** "creation is owner-scoped" above was wrong — `CreateIndividualRockDialog`/`CreateTeamRockDialog` let the creator pick *any* Vivacity user as owner, not just themselves; "own" describes the typical case, not an enforced boundary. This tracing also found a real authorization bypass in the RPC-based edit path (`upsert_rock_with_parenting`, `SECURITY DEFINER`, zero internal check, RLS-bypassing) — fixed same-day — and that `eos.rocks.company.create`'s SA/Team-Leader-only restriction has no enforcement point in the UI or RLS today. See [P1-x](p1-x-eos-rocks-own-manage-golden-matrix-draft.md) and its linked audit entry for full detail; this row is not yet ready for R2-a vertical-slice approval like `eos.scorecard.manage` was |
| `eos.scorecard.manage` | `src/pages/EosScorecard.tsx:67,96-134` gates metric edit/create, history view, record entry, refresh, and mutation hooks for update/archive/delete | `view`; `create`; `edit`; `archive`; `delete`; `record`; `view history`; `refresh/recompute` | Source-backed inventory complete; `record` and configuration actions have different audit/risk characteristics. **Approved as R2-a's first bounded vertical slice (Carl, 2026-09-15)** — self-contained, no overlap with other active initiative work. **Correction, same day:** the page-component check that first confirmed "internal Vivacity-only" missed that the underlying `eos_scorecard`/`eos_scorecard_entries`/`eos_scorecard_metrics` tables' RLS had a real client-tenant-reachable access path (`has_any_eos_role`/`can_facilitate_eos` plus a direct tenant+role clause). Investigated and retired — see [2026-09-15 audit entry](../../../../audit-log/entries/2026-09-15-retire-client-eos-access.md). The row's classification is genuinely **internal Vivacity-only** again now that the fix is live, but that required a real migration, not just a doc note; do not repeat "check the page component only" as a sufficient verification method for tenant/resource semantics — check the actual RLS/table layer |
| `staff.addin.use` | `supabase/functions/_shared/addin-auth.ts:100-116`'s `enforceVivacityTeamRole()` calls `checkPermission(admin, user_uuid, FeatureKeys.staffAddin)` directly and is invoked by 5 of the 7 `addin-auth.ts` importers: `addin-email-capture`, `addin-email-create-task`, `addin-email-link-attachments`, `addin-meeting-capture`, `addin-meeting-create-time-draft` (the other 2 importers use different checks — `addin-auth-exchange` does token exchange only, `addin-diagnostics-usage` gates on `adminSystemConfig` instead) | `launch` (token exchange); `capture/create` (email/meeting capture, task creation, time-draft creation); `link attachments`; external Outlook/Teams add-in side effect | Source-backed inventory complete (corrected 2026-09-15 — the 2026-09-12 static pass searched for the literal string and missed the `FeatureKeys.staffAddin` symbol reference); role/scope semantics for each add-in action still need product review. Tenant/resource semantics verified 2026-09-15: **per-tenant** — the capability gate itself is staff-internal, but each captured action resolves to a specific client-tenant context (confirmed via `addin-email-capture`'s required `client_id` field) |
| `staff.ai.use` | P1-d Edge refs cover `assistant-answer`, `clickup-ai-search`, `client-ai-companion`, and `copilot-chat` | `launch`; `search/retrieve`; `answer/generate`; `write/send/share`; structured-context access; external tool side effect | Source-backed endpoint family; tenant/client data provenance and output-sharing boundary require Client Health/TOM/RBAC review. Tenant/resource semantics verified 2026-09-15: **per-tenant, uniformly** — all four consumers take real `tenant_id`/client context (`client-ai-companion` checks `allowTenantMember`; `clickup-ai-search` requires `tenant_id` with a 400 on missing; `copilot-chat` scopes by `tenant_id` when present; `assistant-answer` builds tenant-scoped engagement overviews). Not a staff-internal-vs-per-tenant mix as originally assumed |
| `staff.meetings.use` | P1-d Edge refs cover `generate-meeting-recurrence`, `generate-minutes-from-transcript`, `publish-meeting-minutes`, and `sync-meeting-artifacts` | `read`; `generate`; `sync/import`; `publish`; `edit artifact`; external recording/transcript side effect | Source-backed endpoint family; worker identity, participant scope, and publish authority need separate rows. Tenant/resource semantics verified 2026-09-15: **per-tenant, uniformly** — all four consumers are `tenant_id`-scoped; `generate-meeting-recurrence` explicitly validates the caller is facilitator/admin *for that tenant_id*, and `publish-meeting-minutes` paths its storage by `tenant_id`. Not internal-only as originally assumed |
| `staff.research.use` | P1-d Edge refs cover knowledge-graph query, research answer, audit intelligence, evidence-gap check, public snapshot, scrape, and TAs-context functions | `search/query`; `retrieve`; `enrich/derive`; `export/public-share`; external `scrape`; audit/intelligence write | Source-backed endpoint family; public snapshot/export and external-source access require sensitivity review. Tenant/resource semantics verified 2026-09-15: **genuinely mixed** — `research-answer`, `query-knowledge-graph`, `research-scrape` are global (zero tenant reference); `research-audit-intelligence`, `research-evidence-gap-check`, `research-tas-context`, `research-public-snapshot` all require `tenant_id` (the last is also external-facing). 4 of 7 consumers are tenant-scoped, more than the single flagged exception originally assumed |
| `staff.sharepoint.use` | P1-d Edge refs cover browse, liveness, import template, resolve URL/folder, upload, validate root, and compliance-folder verification | `browse/read`; `resolve`; `validate`; `import`; `upload/write`; `verify`; external SharePoint side effect | Source-backed endpoint family; tenant/site/document relationship and write/share scope need explicit proof. Tenant/resource semantics verified 2026-09-15: **per-tenant**, confirmed via `browse-sharepoint-folder`'s server-side `tenant_id` resolution (matches the existing Edge Function security guardrail pattern of never trusting a caller-supplied resource ID directly) |

## Findings that affect the next packet

### 1. `admin.team_users.manage` is not one safe capability

The strongest evidence is the spread of the same `full` feature check across
profile edits, role changes, disable/delete flows, invitation and recovery
mail, onboarding, imports/syncs, token issuance, and legacy ghost activation.
Those operations differ materially in target, reversibility, external effect,
and security risk. The next worksheet must treat this row as a legacy umbrella
and trace each caller to a proposed atomic row before any default bundle is
designed. Ghost activation and contact promotion remain gated by the TOM
lifecycle contract.

### 2. Some “manage” rows are only downstream or shared-boundary evidence

`admin.email_templates.manage`, `admin.tenant_users.manage`, and
`admin.academy_mgmt.manage` do not have a concrete live feature-key caller in
the checked source (re-checked 2026-09-15 for the first two; `admin.email_templates.manage`'s
actual enforcement boundary for its resource turns out to be table RLS, not
this feature key — see the register above). Their candidate action lists are
useful questions, not classifications. This distinction prevents a catalogue
label or an allowlist entry from becoming false proof of current enforcement.

`staff.addin.use` was corrected out of this group on 2026-09-15: it has a
concrete, live production enforcement call (`enforceVivacityTeamRole()` in
`addin-auth.ts`, gating 5 of 7 add-in Edge Functions) that the original
2026-09-12 static pass missed by searching for the literal permission string
instead of the `FeatureKeys.staffAddin` symbol reference. Any future static
pass over this ledger should grep for both the literal string and the
`FeatureKeys.<alias>` symbol before recording a row as caller-less.

### 3. Tenant and data sensitivity are not implied by the action verb

The same candidate verb may need different scope or relationship proof. For
example, an Academy tenant-access toggle is not the same as internal EOS
configuration; SharePoint upload is not equivalent to SharePoint browse; and
AI retrieval or public research snapshots can expose data beyond the caller's
ordinary UI context. The golden matrix must carry resource, tenant, and
relationship columns beside the action, rather than deriving them from
`manage`/`use`.

### 4. High-risk families stay non-delegable pending review

Permission administration, system configuration, vector deletion/rebuild,
credential/token issuance, export/public sharing, destructive user/tenant
actions, and external writes remain security-review rows. Decomposition does
not approve delegation, role defaults, break-glass access, or a legacy-to-v6
fallback.

## Review-ask resolutions (Carl, 2026-09-15)

All five R2-a review asks are now resolved. None of these authorize
implementation, grants, role defaults, or runtime change by themselves — they
set the direction for the golden-matrix worksheet and the first vertical
slice.

1. **Action-family vocabulary: approved as-is.** The 9 candidate families
   (`view/list/inspect`, `create`, `edit/update`, `delete/disable/revoke`,
   `assign/manage_access`, `invite/resend/cancel`, `publish/apply/complete`,
   `generate/sync/import/export`, `search/retrieve/share`) stand as the review
   vocabulary for all 18 rows, no changes requested.
2. **Tenant/resource/relationship semantics: assigned for all 18 rows**, each
   verified against current source (not just inferred from the row label) —
   see the per-row notes in the register above and the corrections five of
   them required. Classification taxonomy used: (A) internal Vivacity-only,
   (B) per-tenant/client-scoped, (C) owner-only, (D) mixed/needs sub-action
   split before one answer is possible.
3. **Hard-Super-Admin lock, by family, not by whole row:**
   - Locked, no exceptions: permission administration
     (`admin.permissions.manage`), system configuration
     (`admin.system_config.manage`), vector deletion/rebuild
     (`admin.vector.manage`), and credential/token issuance (the
     `generate-recovery-link`/magic-link/password-reset/token-issuance
     sub-family within `admin.team_users.manage`).
   - Explicitly *not* hard-locked (delegable pending security review):
     destructive user/tenant actions (`delete-user`/`disable`/
     `activate-ghost-user`, also within `admin.team_users.manage`),
     export/public-sharing, and external writes.
4. **Owners assigned for caller-less rows:**
   - `admin.tenant_users.manage` → RBAC v6 itself (not handed to TOM).
   - `admin.academy_mgmt.manage` → deferred until the concurrent Academy
     Solo implementation session settles, to avoid overlapping work.
   - `admin.email_templates.manage` → retire this row entirely; model
     email-template admin access as its own new row keyed to the RLS roles
     (`is_super_admin_safe`/`is_vivacity_team_safe`) instead of continuing to
     treat this feature key as its stand-in. Creating that replacement row is
     a follow-up packet, not done here. The interim route-guard gap this row
     surfaced was already fixed same-day (PR #1311).
5. **First bounded vertical slice approved: `eos.scorecard.manage`** —
   self-contained, cleanly source-backed, internal-only (no tenant
   dependency), and has no overlap with any other initiative's active work.
   This is the row to carry through the golden matrix, negative cases,
   rollback, and observation gates first, as the proof case for the rest of
   the decomposition.

The next unattended preparation is to update the versioned golden-matrix
worksheet with these approved rows and to trace `eos.scorecard.manage`'s
server boundaries as the first slice's implementation prerequisite. No
role/default/grant or runtime change is implied by this packet.

## Verification

This is a docs-only packet. Before opening its PR, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

No frontend, Edge, migration, schema, authorization, credential, or live-QA
verification is applicable because no runtime source changed.
