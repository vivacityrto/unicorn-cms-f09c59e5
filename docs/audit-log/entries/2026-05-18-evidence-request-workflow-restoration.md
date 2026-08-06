# Audit: 2026-05-18 — evidence-request-workflow-restoration

**Trigger:** Lovable production DB change session (RLS relaxation) + the
preceding frontend fixes that brought the evidence-request workflow to a
state where the DB change was meaningful.

**Scope:** Full client-portal evidence-request workflow — from CSC
sending an evidence request through a client receiving, uploading, and
the CSC reviewing the response — plus the `client_audits` RLS relaxation
that lets the audit-prep card surface for real client logins.
Investigated `evidence_requests`, `evidence_request_items`,
`portal_documents`, `client_audits`, `audit_appointments` and all
relevant client/staff hooks. Did NOT investigate: the broader
notification pipeline, `tenant_document_requests` (already disabled
2026-05-15), View-as-Client divergence as a class of bug (parked).

## Findings

- **Six frontend↔DB value mismatches** were preventing the workflow from
  functioning end-to-end. All matched the pattern "frontend invented a
  value the DB CHECK / RLS doesn't accept":

  | Surface | Wrong frontend value | Correct DB value |
  |---|---|---|
  | `evidence_request_items` column | `sort_order` | `display_order` |
  | `evidence_request_items` column | `reviewed_by_user_id` | `reviewed_by` |
  | `evidence_request_items.status` UI literal | `revision_requested` | `resubmit_requested` |
  | `evidence_requests.status` insert | `sent` | `open` |
  | `portal_documents.direction` | `inbound` | `client_to_vivacity` |
  | `portal_documents.source` | `client_upload` | `evidence_response` |

- **`client_audits` RLS was scoped to released audit reports only.**
  Policy `client_audits_tenant_read_v2` required
  `report_client_visible = true AND report_released_at IS NOT NULL`.
  Three features added later assumed clients could see in-progress
  audits but were never paired with an RLS relaxation:
  `AuditReadinessCard` (via `v_client_home_hero.audits_total`),
  `AuditPreparationSection` (works because evidence_requests has its
  own permissive RLS), and `ClientUpcomingAuditSection` (silently
  returned no rows for client logins).

- **Cascading dependency**: `audit_appointments` has no `tenant_id`
  column of its own; its `audit_appts_client_read` policy EXISTS-joins
  `client_audits`, so the appointments were transitively blocked
  whenever `client_audits` was. Relaxing the parent unblocked both.

- **View-as-Client diverges from real client login** as a class of bug.
  The CSC preview runs with staff session (`is_vivacity_team_safe` =
  true → bypasses client RLS), so every CSC-facing test of the client
  portal silently saw more than a real client would see. Surfaced via
  `useReleasedAudits.ts:25-30` comment ("staff bypass tenant RLS via
  `get_current_user_tenant_id()`"). Parked as a class-of-bug
  investigation, not addressed in this session.

- **`/audits/:id` is correctly staff-only via existing ProtectedRoute
  deny-by-default** (`src/components/ProtectedRoute.tsx:52-56`). The
  Prompt-2 plan flagged this as a HIGH-severity column-leak gating
  item; investigation showed the route guard already blocks clients,
  so the mitigation was unnecessary. False alarm in the plan, caught
  in review.

## KB changes shipped

- `unicorn-kb @ <branch:kb/client-audits-column-whitelist>`:
  `pinned/conventions.md` gains a new subsection "Tables with broad RLS
  + sensitive columns (frontend whitelist required)" documenting the
  `client_audits` column-whitelist rule and the sensitive-column list.

## Codebase observations

- `unicorn-cms-f09c59e5 @ eed14de1` ("Dropped old signature for drop"
  — origin/main at time of audit; includes today's Lovable-applied
  migration for `client_audits_tenant_read_active` plus the paired
  frontend changes).
- Migration applied: `client_audits_tenant_read_active` SELECT policy
  on `public.client_audits`, gated on
  `app.user_can_access_tenant(subject_tenant_id) AND status IN
  ('draft','in_progress','review','complete')`. Additive — existing
  `client_audits_tenant_read_v2` (released-only) and
  `client_audits_staff_all` policies unchanged.
- Frontend shipped via 5 Lovable sessions today (all UI-only except
  the migration session). Files touched:
  `src/hooks/useEvidenceRequests.tsx`, `src/hooks/useAuditPrep.ts`,
  `src/components/audit/workspace/SendEvidenceRequestDrawer.tsx`,
  `src/components/audit/workspace/EvidenceRequestsSection.tsx`,
  `src/components/client/AuditPreparationSection.tsx`,
  `src/components/client/ClientActionPlanSection.tsx`,
  `src/components/client/AuditProgressCard.tsx`.
- `AuditProgressCard.tsx` updated to gate score / risk badge on
  `status === 'complete'`. In-progress audits render
  "Pending — audit in progress" instead. Paired UI follow-up to
  the RLS relaxation, ensuring partial scores don't surface
  pre-sign-off.
- DB / migrations: one new RLS policy. Existing policies unchanged.

## Decisions

- **Approach A over B/C for RLS relaxation.** Broad row-level access,
  rely on existing frontend column-whitelist discipline plus the new
  KB convention note for defense-in-depth. Rejected B (SECURITY
  DEFINER function returning whitelisted columns) and C (column-
  whitelist view) — disproportionate refactor surface given the
  current frontend already has the discipline and zero `select('*')`
  on client paths.
- **Statuses for client visibility on in-progress audits:**
  `('draft','in_progress','review','complete')`. Excluded
  `archived` and `cancelled` (released-then-archived audits remain
  visible via `client_audits_tenant_read_v2`).
- **Additive policy, not replacement.** New
  `client_audits_tenant_read_active` runs alongside the existing v2
  policy. OR semantics preserve released-report visibility verbatim
  and make the in-progress visibility named-and-auditable.

## Open questions parked

- **View-as-Client divergence class of bug.** CSC preview uses staff
  session, so every client-portal feature tested only in preview
  silently diverges from real client login. Today's `client_audits`
  RLS bug is one symptom; there are likely others on any
  tenant-scoped table whose RLS is stricter than
  `user_has_tenant_access(tenant_id)`. Worth a sweep — probably
  ADR-worthy.
- **`audit_send_evidence_reminders` cron** still filters
  `WHERE er.status = 'sent'` — a value that doesn't exist in the
  `evidence_requests.status` CHECK constraint (allowed values:
  draft, open, partially_received, received, overdue, closed,
  cancelled). Reminders will never fire until the cron filter is
  fixed to `IN ('open', 'partially_received')`. DB function change,
  separate session.
- **System 1 (general non-audit evidence requests).** Earlier in
  this session we identified `CreateEvidenceRequestDialog` +
  `useCreateEvidenceRequest` as half-shipped scope with no real
  client-portal surface (only the orphaned `/client-portal/:tenantId/
  documents` URL renders it). Decision deferred: unify into the
  audit-prep flow (Option 2) vs. give it a real client portal
  surface (Option 1). 3 test rows in DB, no production usage.

## Tag

audit-2026-05-18-evidence-request-workflow-restoration
