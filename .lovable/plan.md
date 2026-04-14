

## Connect Audit Stages to Audit Workspace

### Summary
Wire all audit-type stages (24, 5, 1106, 6) to the audit workspace via four integration points. Much of the infrastructure already exists from the previous CHC-specific wiring — this broadens it to all audit stages, adds the "no linked audit" prompt card, auto-detect stage context for the modal, and adds stage-task auto-complete toast feedback.

### Current State
- `NewAuditModal` already accepts `preselectedStageInstanceId` and passes it to `useCreateAudit`
- `useCreateAudit` already inserts `linked_stage_instance_id` and back-links `stage_instances.linked_audit_id`
- `AuditProgressCard` already renders when `linked_audit_id` is set in `PackageStagesManager`
- `AuditSidebar` already shows a "Linked to CHC stage" banner
- Milestone calls exist in `useAuditSchedule` (scheduled) and `useAuditReport` (report_released) using `complete_chc_stage_tasks`

### Changes Needed

**1. `src/components/client/PackageStagesManager.tsx`**
- Add "No linked audit" prompt card for audit-type stages (24, 5, 1106) when `!stage.linked_audit_id` — shows "Start this audit in the new audit workspace" with a "+ Create Audit Record" button
- Exclude stage 6 (ASQA) from the prompt per instructions
- The button opens NewAuditModal with `stageInstanceId`, pre-mapped `auditType` (stage 24→compliance_health_check, 5/1106→mock_audit), and tenant context
- Import NewAuditModal and manage modal state locally in StageRow
- Enrich `AuditProgressCard` display: add `risk_rating`, `document_deadline_at`, `closing_meeting_at` to the query and render schedule rows + risk badge + score color bar

**2. `src/components/client/AuditProgressCard.tsx`**
- Expand query to include `risk_rating`, `document_deadline_at`, `closing_meeting_at`, `audit_type`
- Add status badge coloring (draft=grey, in_progress=blue, complete=green)
- Add score progress bar colored by threshold (red <60, amber 60-79, green ≥80)
- Add schedule rows (evidence due, opening, closing dates)
- Use `AuditStatusBadge` for consistent styling

**3. `src/hooks/useAuditSchedule.ts`**
- Replace `complete_chc_stage_tasks` with `complete_audit_stage_tasks` (the generic version that works for all audit-type stages)
- Add toast notification after RPC: `"✓ {count} stage task(s) auto-completed"` when count > 0

**4. `src/hooks/useAuditReport.ts`**
- Replace `complete_chc_stage_tasks` with `complete_audit_stage_tasks`
- Add toast on count > 0

**5. `src/components/audit/workspace/AuditSidebar.tsx`**
- Make the stage link banner label dynamic: detect stage name from a lookup (stage 24→"CHC stage", 5/1106→"Mock Audit stage", 6→"ASQA Audit stage") or just show "Linked stage" generically
- Query `stage_instances` to get `stage_id` for the linked instance to determine label

**6. `src/hooks/useStageAuditLink.ts`** — New hook
- `useStageAuditLink(stageInstanceId)` — fetches `linked_audit_id` and audit details
- `useAutoCompleteStageTasks()` — wrapper around `complete_audit_stage_tasks` RPC with toast feedback

**7. `src/components/client/ClientAuditsTab.tsx`**
- Detect if client has an active audit-type stage instance (stage_id in [24, 5, 1106]) without a linked audit
- Pass `stageInstanceId` to `NewAuditModal` when opening from "Start New Audit" if an unlinked stage exists

**8. `src/components/audit/NewAuditModal.tsx`**
- Add stage-to-audit-type mapping constant: `{24: 'compliance_health_check', 5: 'mock_audit', 1106: 'mock_audit'}`
- When `preselectedStageInstanceId` is provided with a mapped type, lock Step 1 card selection
- Show context banner: "Creating audit for [Stage Name] stage — [Client Name]"
- Show note: "This audit will be linked to your package stage. Stage tasks will auto-complete as you progress."

### Technical Details

Stage-to-audit mapping:
```text
Stage 24  → compliance_health_check  → cc025000-...001
Stage 5   → mock_audit               → a0025000-...001
Stage 1106 → mock_audit              → a0025000-...001
Stage 6   → (no default, user selects)
```

RPC change: `complete_chc_stage_tasks` → `complete_audit_stage_tasks` (both exist in DB, the generic one handles all stage types)

Toast pattern after milestone:
```typescript
const { data: count } = await supabase.rpc('complete_audit_stage_tasks', { p_audit_id, p_milestone });
if (count && count > 0) {
  toast.success(`✓ ${count} stage task${count > 1 ? 's' : ''} auto-completed`);
}
```

| Action | File |
|--------|------|
| Modify | `src/components/client/PackageStagesManager.tsx` — add "no linked audit" prompt for stages 24/5/1106 |
| Modify | `src/components/client/AuditProgressCard.tsx` — enrich with risk, schedule, score colors |
| Modify | `src/hooks/useAuditSchedule.ts` — switch to `complete_audit_stage_tasks`, add toast |
| Modify | `src/hooks/useAuditReport.ts` — switch to `complete_audit_stage_tasks`, add toast |
| Modify | `src/components/audit/workspace/AuditSidebar.tsx` — dynamic stage label |
| Modify | `src/components/audit/NewAuditModal.tsx` — stage-to-type mapping, locked cards, context banner |
| Modify | `src/components/client/ClientAuditsTab.tsx` — detect active stage, pass stageInstanceId |
| Create | `src/hooks/useStageAuditLink.ts` — stage audit link + auto-complete wrapper |

No database migrations required.
