

## Connect CHC Stage to Audit Workspace

### Summary
Wire the existing CHC package stage (Stage ID 24) to the audit module via four integration points: stage-linked audit creation, milestone-driven task auto-completion, sidebar link in workspace, and audit progress card in stage view. DB columns (`client_audits.linked_stage_instance_id`, `stage_instances.linked_audit_id`) and RPC (`complete_chc_stage_tasks`) already exist.

---

### Changes

**1. `src/types/clientAudits.ts`** — Add `linked_stage_instance_id` to `ClientAudit` interface and `opening_meeting_at`/`closing_meeting_at` fields.

**2. `src/hooks/useClientAudits.ts`** — Add `linked_stage_instance_id` to `CreateAuditInput`. In `useCreateAudit` mutationFn:
- Include `linked_stage_instance_id` in the insert payload
- After successful insert, if `linked_stage_instance_id` is set, UPDATE `stage_instances` SET `linked_audit_id = newAuditId` WHERE `id = linked_stage_instance_id`

**3. `src/components/audit/NewAuditModal.tsx`** — Accept new optional props `preselectedStageInstanceId?: number`. Pass it through to `useCreateAudit`. When a stage instance ID is provided alongside `preselectedAuditType`, auto-select the matching card and skip Step 1.

**4. `src/hooks/useAuditSchedule.ts`** — After scheduling opening meeting, call `supabase.rpc('complete_chc_stage_tasks', { p_audit_id, p_milestone: 'scheduled' })`. Wire other milestones:
- In `useScheduleAuditPhase` (opening_meeting) → `'scheduled'`
- In `useCompleteAuditAppointment` (opening complete) → no separate milestone (already covered)

**5. `src/hooks/useAuditReport.ts`** — After `release_audit_report` RPC success, call `complete_chc_stage_tasks` with `'report_released'`.

**6. `src/components/audit/workspace/AuditSidebar.tsx`** — When `audit.linked_stage_instance_id` is set, render a banner below the schedule summary:
```
📋 Linked to CHC stage
[View stage tasks →]
```
Link navigates to `/clients/{tenant_id}?tab=packages&stage={stage_instance_id}`.

**7. `src/components/client/PackageStagesManager.tsx`** — In the stage collapsible content, when `stage.linked_audit_id` is set, render an `AuditProgressCard` above the tabs:
```
🔍 Audit in progress
Compliance Health Check — {title}
Progress: {score_pct}%
Opening meeting: {opening_meeting_at}
[Open Audit Workspace →]
```
Query `client_audits` by `linked_audit_id` for `score_pct`, `opening_meeting_at`, `status`, `title`. Add `linked_audit_id` to the stage_instances select query.

**8. `src/components/client/AuditProgressCard.tsx`** — New component showing audit status, score, opening meeting date, and link to `/audits/{audit_id}`.

### Technical Details

Milestone trigger points:
- `'scheduled'` → `useScheduleAuditPhase` when `appointmentType === 'opening_meeting'`
- `'evidence_sent'` → existing evidence request send flow (future wire, note in code)
- `'conducted'` → `useAuditStatusTransition` when status → `'complete'`
- `'report_released'` → `useReleaseReport` on success

The `complete_chc_stage_tasks` RPC delegates to `complete_audit_stage_tasks` internally — no new DB migration needed.

| Action | File |
|--------|------|
| Modify | `src/types/clientAudits.ts` |
| Modify | `src/hooks/useClientAudits.ts` |
| Modify | `src/components/audit/NewAuditModal.tsx` |
| Modify | `src/hooks/useAuditSchedule.ts` |
| Modify | `src/hooks/useAuditReport.ts` |
| Modify | `src/components/audit/workspace/AuditSidebar.tsx` |
| Modify | `src/components/client/PackageStagesManager.tsx` |
| Create | `src/components/client/AuditProgressCard.tsx` |

No database migrations required.

