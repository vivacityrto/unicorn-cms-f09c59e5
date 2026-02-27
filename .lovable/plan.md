

# Step 1: UI Rename -- All User-Facing "Phase" to "Stage"

## What This Step Does

Renames every user-facing string that says "Phase" to "Stage" across the application. No logic changes. No database changes. No route changes. Internal variable names and database columns stay as-is.

## Scope Summary

- ~40 files need string changes
- 2 files need renaming (phase-steps.tsx, PhaseCompletenessWidget.tsx)
- 1 type file needs renaming (phase.ts to stage-registry.ts)
- 2 doc files need updating
- No imports of the renamed type/component files exist elsewhere, so no import chain to fix

## Detailed Changes by Area

### 1. Navigation (1 file)

**src/components/DashboardLayout.tsx**
- "Manage Phases" -> "Manage Stages"
- "Phase Builder" -> "Stage Builder"
- "Phase Analytics" -> "Stage Analytics"

### 2. Pages (8 files)

**src/pages/StageBuilder.tsx**
- All toast messages and labels: "Phase name is required" -> "Stage name is required", "Phase Created!" -> "Stage Created!", "Phase Builder" -> "Stage Builder", "Phase Basics" -> "Stage Basics", "Phase Content" -> "Stage Content", "Phase Name" -> "Stage Name", "Phase Type" -> "Stage Type"

**src/pages/AdminStageDetail.tsx**
- "EDIT LIVE PHASE" -> "EDIT LIVE STAGE", all toast messages, "Back to Phases" -> "Back to Stages", "Simulate Phase" -> "Simulate Stage", "Phase not found" -> "Stage not found", "Duplicate Phase" -> "Duplicate Stage", "Phase Settings" -> "Stage Settings", field labels

**src/pages/AdminManageStages.tsx**
- "Phase Archived" -> "Stage Archived", "Phase Restored" -> "Stage Restored", "Phase has been archived and hidden from phase selection" -> "...stage selection", "Phase Type" placeholder -> "Stage Type", archive dialog text, import dialog text

**src/pages/PackageDetail.tsx**
- "Phase order updated" -> "Stage order updated", "Phase deleted" -> "Stage deleted"

**src/pages/CalendarTimeCapture.tsx**
- "Phase" label -> "Stage", "Select phase" -> "Select stage"

**src/pages/TimeInbox.tsx**
- "Select phase" -> "Select stage"

**src/pages/AdminAiFeatureFlags.tsx**
- "Phase Completeness Check" -> "Stage Completeness Check", "AI-assisted phase completeness evaluation" -> "AI-assisted stage completeness evaluation"

**src/pages/AdminAssistant.tsx**
- "Phase Progression Timeline" -> "Stage Progression Timeline"

### 3. Admin Components (1 file)

**src/components/admin/AllStagesTable.tsx**
- All toast messages and labels: "Phase deleted/updated/created" -> "Stage ...", "Search phases..." -> "Search stages...", "No phases found" -> "No stages found", column headers

### 4. Package Builder Components (2 files)

**src/components/package-builder/StageLibraryDialog.tsx**
- "Phase name is required" -> "Stage name is required", "Phase Created" -> "Stage Created", "Phase Library" -> "Stage Library", "Search phases..." -> "Search stages...", "Phase Type" -> "Stage Type", "Phases are reusable..." -> "Stages are reusable..."

**src/components/package-builder/FrameworkMismatchDialog.tsx**
- "This phase is not marked..." -> "This stage is not marked...", "Phase:" -> "Stage:", "Phase Frameworks:" -> "Stage Frameworks:"

**src/components/package-builder/StageDocumentsTab.tsx**
- "Select documents from the library to link to this phase" -> "...this stage"

### 5. Client Components (8 files)

**src/components/client/ClientProgressSummary.tsx**
- "Phase Progress" -> "Stage Progress"

**src/components/client/ClientPackagesTab.tsx**
- "Phase Progress" -> "Stage Progress", "X/Y phases" -> "X/Y stages", "No phases configured" -> "No stages configured"

**src/components/client/PackageStagesManager.tsx**
- "Failed to load phases" -> "Failed to load stages", "Phase Updated" -> "Stage Updated", "No phases configured..." -> "No stages configured..."

**src/components/client/ClientPackageBadges.tsx**
- "Phase: {stage}" -> "Stage: {stage}", "Has blocked phases" -> "Has blocked stages"

**src/components/client/StageDocumentsSection.tsx**
- "No documents linked to this phase" -> "...this stage", generation dialog text

**src/components/client/StageStaffTasks.tsx**
- "No staff tasks configured for this phase" -> "...this stage"

**src/components/client/StageEmailsSection.tsx**
- "No emails linked to this phase" -> "...this stage"

**src/components/client/StageDetailSection.tsx**
- "Phase details saved" -> "Stage details saved", "Add notes about this phase..." -> "...this stage..."

### 6. Dialog Components (2 files)

**src/components/AddExistingStageDialog.tsx**
- All instances: "Phase Already Added" -> "Stage Already Added", "Add Existing Phase" -> "Add Existing Stage", "Search phase..." -> "Search stage...", etc.

**src/components/AddStaffTaskDialog.tsx**
- "Package and phase must be selected" -> "Package and stage must be selected"

### 7. Stage Components (2 files)

**src/components/stage/StageDependencySelector.tsx**
- "Search phases..." -> "Search stages...", "No phases found" -> "No stages found"

**src/components/stage/StageDocumentsPanel.tsx**
- "Document unlinked from phase" -> "...from stage"

### 8. Membership Components (2 files)

**src/components/membership/StageStatusControl.tsx**
- "Cannot skip required phase" -> "...required stage", "Phase updated" -> "Stage updated", "Error updating phase" -> "Error updating stage", dialog titles "Block Stage" (already correct), descriptions mentioning "stage" (check and fix any remaining "phase")

**src/components/membership/StageCellEditor.tsx**
- Same pattern: "Cannot skip required phase" -> "...required stage", toast messages

### 9. Ask Viv Components (5 files)

**src/components/ask-viv/AskVivScopeSelectorModal.tsx**
- "Phase" label -> "Stage", "No phases available" -> "No stages available", "All phases" -> "All stages", "Loading phases..." -> "Loading stages..."

**src/components/ask-viv/AskVivExplainPanel.tsx**
- "Phase" chip label -> "Stage"

**src/components/ask-viv/AskVivScopeBanner.tsx**
- "Inferred from active phases" -> "Inferred from active stages"

**src/components/ask-viv/AskVivMicroExplain.tsx**
- Help text: "phases" -> "stages", "phase progression" -> "stage progression", "blocking this phase" -> "blocking this stage"

**src/components/ask-viv/AskVivPanel.tsx**
- "Query clients, phases, tasks..." -> "Query clients, stages, tasks..."

### 10. Executive Dashboard Components (3 files)

**src/components/executive/ExecutionMomentumPanel.tsx**
- "Phases Completed" metric label -> "Stages Completed"

**src/components/executive/ClientHealthDrawer.tsx**
- "Complete next phase actions" -> "Complete next stage actions", "Phase Completion" -> "Stage Completion", "Phase Drift" -> "Stage Drift"

**src/components/executive/AlignmentSignalsPanel.tsx**
- Comment update only (if filtering by 'phase_completed' -- internal value stays)

### 11. Dashboard Components (1 file)

**src/components/dashboard/WeeklyWinTracker.tsx**
- "Phases Completed" -> "Stages Completed"

### 12. Hooks (2 files)

**src/hooks/usePackageStageOverrides.tsx**
- "Failed to sync phase to packages" -> "Failed to sync stage to packages"

**src/hooks/usePredictiveRisk.ts**
- "Phase stagnant for..." -> "Stage stagnant for..."

### 13. File Renames (3 files)

**src/components/ui/phase-steps.tsx -> src/components/ui/stage-steps.tsx**
- Rename `PhaseSteps` -> `StageSteps`, `PhaseStepsProps` -> `StageStepsProps`
- Update doc comments: "Phase Step Indicator" -> "Stage Step Indicator", "compliance phases" -> "compliance stages"
- No external imports exist -- safe rename

**src/components/phase/PhaseCompletenessWidget.tsx -> src/components/stage/StageCompletenessWidget.tsx**
- Rename component and props interface
- "Phase Completeness" heading -> "Stage Completeness"
- "evaluate phase completeness" -> "evaluate stage completeness"
- No external imports exist -- safe rename

**src/types/phase.ts -> src/types/stage-registry.ts**
- Rename all exported types per conflict resolution table:
  - `PhaseRegistry` -> `StageRegistry`
  - `PhaseRegistryInsert` -> `StageRegistryInsert`
  - `PhaseRegistryUpdate` -> `StageRegistryUpdate`
  - `PhaseType` -> `StageClassification` (avoids conflict with `StageType` in membership.ts)
  - `PhaseStatus` -> `StageLifecycleStatus` (avoids conflict with `StageStatus` in membership.ts)
  - `PhaseWithMetadata` -> `StageWithMetadata`
  - `PhaseSummary` -> `StageSummary`
  - `PhaseDependencyNode` -> `StageDependencyNode`
- Update all doc comments
- No external imports exist -- safe rename

### 14. Edge Function Display Strings (1 file)

**supabase/functions/_shared/ask-viv-fact-builder/scope-lock.ts**
- `formatScopeForDisplay`: "Phase" -> "Stage" in output string
- Test file assertions updated to match

### 15. Documentation (2 files)

**docs/phase-registry.md -> docs/stage-registry.md**
- Rewrite all "Phase" references to "Stage"

**docs/phase-naming-conventions.md**
- Rewrite to reflect new terminology (Stage = workflow step, Phase = checkpoint group coming in Step 2)

### 16. Celebration Event Type (1 file, internal but informational)

**src/lib/emit-celebration.ts**
- `'phase_complete'` event type -- keep as-is (internal event key, not user-facing)

## What Does NOT Change

- Database table/column names
- Route paths (/admin/stages, /admin/stage-builder, etc.)
- Internal variable names (phaseId, phase_completion, etc.)
- Database view column names (phase_completion, phases_completed, current_phase_name)
- Edge function names (calculate-phase-completeness)
- EOS docs (docs/eos/phase-2.md etc. -- project build phases, not the Stage/Phase concept)
- Code comments referencing "Unicorn 2.0 Phase 10/15/16" (project milestones)
- ProgressMode value 'phase_based' in membership.ts (database value)
- PackagePhase type in membership.ts (leave for now, maps to data fields)
- Internal scope field names (phase_id, phase_name in Ask Viv interfaces)
- Print component "Package/Phase:" label (will become relevant again in Step 2)

## Build Order

All files are independent string replacements. Will be done in parallel batches:
1. Navigation + Pages (9 files)
2. Admin + Package Builder + Client components (13 files)
3. Dialogs + Stage + Membership components (6 files)
4. Ask Viv + Executive + Dashboard components (9 files)
5. Hooks + File renames + Edge functions + Docs (8 files)

## Risk

Zero logic changes. All existing functionality preserved. The only risk is a missed string -- visual review after deployment recommended.

