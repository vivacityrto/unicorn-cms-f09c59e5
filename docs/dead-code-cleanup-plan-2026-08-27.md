# Dead-Code Cleanup — Implementation Plan

**Date:** 27 August 2026
**Repo:** `unicorn-cms-f09c59e5` (Unicorn 2.0 / ComplyHub.ai — single frontend, no Vivacity Coaching code paths involved)
**Produced by:** a 44-agent audit workflow (parallel dead-code finders + git-history cross-reference + per-candidate blast-radius re-verification + synthesis), 27 Aug 2026.
**Execution branch:** `chore/dead-code-cleanup-batch-1` (branched from `origin/main`), one PR per batch below.

## Baseline (before any removal)

Measured via `git ls-files 'src/**' 'supabase/functions/**' | xargs cat | wc -l` on `main` @ `a1476952`, 27 Aug 2026:

| | Files | Lines |
|---|---:|---:|
| `src/**` | 1,666 | 448,463 |
| `supabase/functions/**` | 362 | 89,973 |
| **Total** | **2,028** | **538,436** |

*End-state numbers will be appended here once all batches are merged, for a before/after comparison.*

## Progress tracker

| Batch | Scope | Files | Status | PR |
|---|---|---:|---|---|
| 1 | Retired edge-function 410 stubs (§2.35) | 7 | ✅ Done | #TBD |
| 2 | Unused shadcn/ui scaffold primitives (§2.27) | 17 | ✅ Done | #TBD |
| 3 | Orphaned barrel/index files (§2.6) | 2 | 🔲 Not started | — |
| 4 | Unused data-layer hooks (§2.30) | 12 | 🔲 Not started | — |
| 5 | Orphaned EOS review-pane cluster (§2.14) | 19 | 🔲 Not started | — |
| 6 | Orphaned Executive dashboard widgets (§2.15) | 8 | 🔲 Not started | — |
| 7 | Document/Excel/release-readiness cluster (§2.12–2.13) | 14 | 🔲 Not started | — |
| 8 | Client-portal component cluster (§2.5, §2.7, §2.29) | 15 | 🔲 Not started | — |
| 9 | Tenant-panel cluster (§2.26) — needs §3 sign-off on `StageHealthPanel.tsx` first | 8 | 🔲 Not started | — |
| 10 | KPI reviewer-admin cluster + remaining dead pages (§2.18, §2.29) | 8 | 🔲 Not started | — |
| 11 | Remaining single-file/small-cluster components (grab-bag) | ~45 | 🔲 Not started | — |
| 12 | PDP superseded components + lib/utils/integrations (§2.31–2.34) | 9 | 🔲 Not started | — |
| §3 | Needs-review items (4 frontend + 15 edge functions) — hold for explicit sign-off | 19 | ⏸️ Parked | — |

---

## 1. Summary

| | Count |
|---|---|
| Total candidates evaluated | **172** |
| Safe to remove now | **153** |
| Needs manual review before removing | **19** |
| Confirmed false positives / look-alikes (not part of the 172, but must not be re-flagged) | **~20** noted below |

Breakdown of the 172 by area:

| Area | Total | Safe | Needs review |
|---|---:|---:|---:|
| `src/components/**` | 120 | 118 | 2 |
| `src/pages/**` | 8 | 8 | 0 |
| `src/hooks/**` | 13 | 12 | 1 |
| `src/features/pdp/**` | 2 | 2 | 0 |
| `src/lib/**` | 5 | 4 | 1 |
| `src/utils/**` | 1 | 1 | 0 |
| `src/integrations/**` | 1 | 1 | 0 |
| `supabase/functions/**` | 22 | 7 | 15 |

The `supabase/functions/**` split is the important one operationally: **7 are already-retired 410 stubs** with zero blast radius, while **15 are live, deployed functions with no in-repo caller** — these carry real production risk if deleted on code-search evidence alone, per the explicit prior audit guardrails (`docs/edge-function-remediation-handoff.md`, the 2026-08-18 security audit doc) that this synthesis is bound to respect.

No entity-ambiguity issues surfaced — everything here is Unicorn/ComplyHub.ai frontend and edge-function code; nothing touches Vivacity Coaching & Consulting content or billing.

---

## 2. Safe to remove now

### 2.1 `src/components/academy/admin/*` (3)
| File | Symbol | Reason |
|---|---|---|
| `AcademyStatusBadge.tsx` | `AcademyStatusBadge` | Zero importers anywhere; no barrel. |
| `AudienceTags.tsx` | `AudienceTags` | Zero importers anywhere; no barrel. |
| `VideoThumbnail.tsx` | `VideoThumbnail` | Zero importers anywhere; no barrel. |

### 2.2 `src/components/admin/*` (4)
| File | Symbol | Reason | Git-history context |
|---|---|---|---|
| `AIChatbot.tsx` | `AIChatbot` | Zero importers; file self-declares `@deprecated`, superseded by Ask Viv (`src/components/ask-viv/**`). | — |
| `InviteAuditSummaryCard.tsx` | `InviteAuditSummaryCard` | `ManageInvites.tsx` implements its own inline stats/table; never used this. | — |
| `InviteFailuresTable.tsx` | `InviteFailuresTable` | No importers anywhere. | — |
| `UnifiedInviteTable.tsx` | `UnifiedInviteTable` | Superseded — `ManageInvites.tsx` renders its own inline `<Table>`. | — |

### 2.3 `src/components/audit/*` (2)
| File | Symbol | Reason |
|---|---|---|
| `LiveInspectionDialog.tsx` | `LiveInspectionDialog` | `Audits.tsx` uses `AuditInspectionsTable` + an inline `ConfirmDialog` instead. |
| `StartInspectionDialog.tsx` | `StartInspectionDialog` | `Audits.tsx` implements `handleStartInspection` locally; never wired to this dialog. |

### 2.4 Billing / Capacity (2)
| File | Symbol | Reason |
|---|---|---|
| `billing/ComplianceBillingBlock.tsx` | `ComplianceBillingBlock` | No importers anywhere. |
| `capacity/MembershipUsageCard.tsx` | `MembershipUsageCard` | No importers anywhere. |

### 2.5 `src/components/client/*` (11) — orphaned client-portal cluster
| File | Symbol | Reason | Git-history context |
|---|---|---|---|
| `ActivityTimeline.tsx` | `ActivityTimeline` | Component never rendered; **its data hook `useClientActivityTimeline` is live via `CompliancePulseBanner.tsx` — do not remove the hook.** | — |
| `AttentionPanel.tsx` | `AttentionPanel` | No importers; only a historical audit-log mention. | — |
| `ClientActionPlanSection.tsx` | `ClientActionPlanSection` | No importers. | Audit entry `2026-05-18-evidence-request-workflow-restoration.md` lists this file among ones touched in a past restoration PR — worth one extra human glance (see §3), but current code has zero live references. |
| `ClientDocumentsTab.tsx` | `ClientDocumentsTab` | No importers. | — |
| `ClientNotesTab.tsx` | `ClientNotesTab` | No importers. | Already documented as orphaned as of 2026-05-06 audit entry — long-standing dead code. |
| `ClientPackageBadges.tsx` | `ClientPackageBadges` | No importers. | — |
| `ClientProgressSummary.tsx` | `ClientProgressSummary` | No importers. | — |
| `ClientSharePointDocumentsTab.tsx` | `ClientSharePointDocumentsTab` | No importers; unrelated to the live SharePoint edge functions. | — |
| `ClientTimeWidget.tsx` | `ClientTimeWidget` | No importers anywhere. | — |
| `ConsultantAssignmentCard.tsx` | `ConsultantAssignmentCard` | No importers; only historical audit-log mentions. | Independently flagged orphaned in `2026-07-27-csc-assignment-silent-failure.md`. |
| `TimelineExportDialog.tsx` | `TimelineExportDialog` | No importers. | A migration comment (`20260818090000_...sql`) names this dialog as a historical RPC caller — check if that RPC is now itself orphaned as a **separate** follow-up (not in this candidate's scope). |

### 2.6 Barrel files (2)
| File | Symbol | Reason |
|---|---|---|
| `client-impact/index.ts` | whole file | Every real consumer (`ClientImpactPage.tsx`, `EosClientImpactDetail.tsx`, `EosClientImpact.tsx`) imports the underlying components directly, never via this barrel. |
| `eos/facilitator/index.ts` | whole file | `LiveMeetingView.tsx` imports `FacilitatorChecklist`/`FacilitatorPrompts`/`RocksInsights` directly, bypassing the barrel entirely. |

### 2.7 `client-portal/ClientAICompanionPanel.tsx` (1)
No importers; only a historical audit-log mention of the earlier Ask Viv/Gemini integration attempt.

### 2.8 `src/components/compliance/*` (3)
| File | Symbol | Reason |
|---|---|---|
| `CompletionSummaryModal.tsx` | `CompletionSummaryModal` | No importers; consumes still-live `ComplianceScoreRing`/`useComplianceScore` but nothing imports the modal itself. |
| `ComplianceScoreCard.tsx` | `ComplianceScoreCard` | No importers; distinct from the still-used `ComplianceScoreRing`/`ComplianceScoreBreakdown` — don't confuse. |
| `ProgressAnchors.tsx` | `ProgressAnchors` | No importers. The similarly-named `useProgressAnchors` **hook** is a distinct, unrelated, presumably-live utility — don't remove that. |

### 2.9 `consultant/ConsultantWorkloadPanel.tsx` (1)
No importers anywhere.

### 2.10 Top-level misc components (4)
| File | Symbol | Reason |
|---|---|---|
| `AddDocumentDialog.tsx` | `AddDocumentDialog` | No importers; only a prose audit-log mention. |
| `CreateEmailDialog.tsx` | `CreateEmailDialog` | No importers. |
| `UserProfileCard.tsx` | `UserProfileCard` | No importers; already flagged orphaned in the 2026-05-15 audit entry. |
| `UseTemplateDialog.tsx` | `UseTemplateDialog` | No importers. |

### 2.11 `src/components/dashboard/*` (3)
| File | Symbol | Reason |
|---|---|---|
| `DashboardCharts.tsx` | `DashboardCharts` | No importers, no barrel. |
| `DashboardStats.tsx` | `DashboardStats` | No importers. Distinct from `useAcademyDashboardStats` hook — don't confuse. |
| `RecentActivity.tsx` | `RecentActivity` | No importers. Distinct from `HomeRecentActivitySection`/`feed.recentActivity` (live, in `ClientHomePage.tsx`) and unrelated edge-function helpers of similar name — don't confuse. |

### 2.12 `src/components/document/*` (13) — orphaned document/Excel/release cluster
| File | Symbol | Reason |
|---|---|---|
| `AIAnalysisSummaryCard.tsx` | `AIAnalysisSummaryCard` | No importers. |
| `BulkUploadAISummary.tsx` | `BulkUploadAISummary` | No importers. |
| `DocFileExtractedFields.tsx` | `DocFileExtractedFields` | No importers. |
| `DocumentLibraryBrowser.tsx` | `DocumentLibraryBrowser` | No importers. |
| `DocumentScanStatus.tsx` | `DocumentScanStatus` | No importers. |
| `DocumentStageUsagePanel.tsx` | `DocumentStageUsagePanel` | No importers. |
| `DocumentVersionHistory.tsx` | `DocumentVersionHistory` | No importers. *Git-history:* a 2026-08-12 migration comment independently confirms "caller (DocumentVersionHistory.tsx) is orphaned since the `/document/:id` route was removed" (the route was retired in commit `7137652c`). |
| `ExcelDataSourcesTab.tsx` | `ExcelDataSourcesTab` | No importers; consumes still-live `useExcelDataSources` but is never rendered — superseded by the lighter `ExcelBindingStatusBadge`/`DocumentReadinessBadge` in `StageDocumentsPanel.tsx`. |
| `ExcelFieldsTab.tsx` | `ExcelFieldsTab` | Same pattern — consumes live `useExcelBindings` but is itself never rendered. |
| `ReleaseReadinessDialog.tsx` | `ReleaseReadinessDialog` | No importers; not opened from `ManageDocuments.tsx`, `ManageStages.tsx`, `AdminStageDetail.tsx`, or `StageDocumentsPanel.tsx`. |
| `ReleaseReviewPanel.tsx` | `ReleaseReviewPanel` | No importers; `AdminReviews.tsx` reimplements equivalent UI inline instead of using this. |
| `StageDeliveryPanel.tsx` | `StageDeliveryPanel` | No importers. Unrelated to the Academy tier removal (`5390915c`) — separate subsystem. |
| `TenantPacksList.tsx` | `TenantPacksList` | No importers, no barrel. |

*Batch note:* the last five of these (`ExcelDataSourcesTab`, `ExcelFieldsTab`, `ReleaseReadinessDialog`, `ReleaseReviewPanel`, `StageDeliveryPanel`) form one coherent scaffolded-then-abandoned "document release readiness" feature, all last touched Jan–Feb 2026 and untouched since — safe to remove as one PR.

### 2.13 `documents/bulk-generate/BulkGenerateDialog.tsx` (1)
No importers — superseded by the active `documents/bulk-generate/steps` and `targeted/` flow.

### 2.14 `src/components/eos/*` (19) — orphaned EOS review-pane / legacy-dialog cluster
| File | Symbol | Reason |
|---|---|---|
| `AISidebar.tsx` | `AISidebar` | No importers (only an example in `docs/eos/phase-7.md`). |
| `CarryForwardReviewDialog.tsx` | `CarryForwardReviewDialog` | No importers. |
| `ChartReviewPane.tsx` | `ChartReviewPane` | No importers — part of the review-pane cluster superseded by `eos/scorecard2` and `eos/facilitator`. |
| `FinaliseMinutesDialog.tsx` | `FinaliseMinutesDialog` | No importers anywhere in repo. |
| `MeetingSeriesEditor.tsx` | `MeetingSeriesEditor` | No importers. |
| `MetricEditorDialog.tsx` | `MetricEditorDialog` | Superseded — `EosScorecard.tsx` uses `MetricEditorDialogV2` (`scorecard2/`) instead. |
| `MinutesHistoryPanel.tsx` | `MinutesHistoryPanel` | No importers. |
| `MinutesStatusBadge.tsx` | `MinutesStatusBadge` | No importers. |
| `MinutesVersionViewer.tsx` | `MinutesVersionViewer` | No importers. |
| `MultiClientSelector.tsx` | `MultiClientSelector` | No importers — scaffolding for an EOS Phase 7 feature documented but never wired in. |
| `QuorumStartGate.tsx` | `QuorumStartGate` | No importers. |
| `RecurringSeriesView.tsx` | `RecurringSeriesView` | No importers. |
| `RockPlanningPane.tsx` | `RockPlanningPane` | No importers; not used by any of the 27 files that import from `components/eos/*`. |
| `RocksRetrospectivePane.tsx` | `RocksRetrospectivePane` | No importers. |
| `ScorecardGrid.tsx` | `ScorecardGrid` | No importers — superseded by `EosScorecard.tsx` + `eos/scorecard2/**`. |
| `SeatHealthWatchlist.tsx` | `SeatHealthWatchlist` | No importers. Unrelated to the `seat_health_recommendations` DB fix (2026-08-11) — no coupling. |
| `SWOTPane.tsx` | `SWOTPane` | No importers. |
| `VTOReviewPane.tsx` | `VTOReviewPane` | No importers — part of the unused review-pane cluster. |

*Git-history note for this whole cluster:* none of it is related to the Academy Solo/Team/Elite tier removal (`5390915c`) or the RBAC remediation pass (`23bdcf8e`) — this is a pre-existing, independent orphaned-UI cluster from an earlier EOS iteration superseded by `scorecard2`/`facilitator`.

### 2.15 `src/components/executive/*` (8)
| File | Symbol | Reason |
|---|---|---|
| `AIResearchActivityWidget.tsx` | `AIResearchActivityWidget` | No importers. |
| `ClientHealthMatrix.tsx` | `ClientHealthMatrix` | No importers. |
| `ConsultantDistributionTable.tsx` | `ConsultantDistributionTable` | No importers. |
| `ExecutiveKpiStrip.tsx` | `ExecutiveKpiStrip` | No importers. |
| `PriorityQueueTable.tsx` | `PriorityQueueTable` | No importers; not one of the widgets `ExecutiveDashboard.tsx` renders. |
| `SignalsPanel.tsx` | `SignalsPanel` | No importers — **do not confuse with `AlignmentSignalsPanel.tsx`, a separate live component** (see §4). |
| `SystemHealthBlock.tsx` | `SystemHealthBlock` | No importers; `useExecSystemHealth` is an unrelated live data hook. |
| `WatchlistPanel.tsx` | `WatchlistPanel` | No importers. **Important:** the folder itself is NOT dead — `ExecutiveDashboard.tsx` is a live routed page importing ~20 other `executive/*` widgets. Only this specific file is orphaned. |

### 2.16 `governance/GovernanceImportDialog.tsx` (1)
No importers. *Git-history:* explicitly documented as orphaned in the 2026-08-12 audit entry — "same dead-component pattern as the `/document/:id` page retired earlier that session."

### 2.17 `help-center/FloatingChatbot.tsx` (1)
No importers — the live help-center entry point (`ChatTab.tsx`) is self-contained and never imports this.

### 2.18 `src/components/kpi/*` (3) — orphaned reviewer-admin cluster
| File | Symbol | Reason |
|---|---|---|
| `KpiReviewPanel.tsx` | `KpiReviewPanel` | No importers; the `/admin/kpi-review` route it was built for no longer exists in `App.tsx` — superseded by the `/kpi` page's inline "Team KPI" toggle (`KpiTeamSection`, kpi-v2). |
| `KpiStaffSelector.tsx` | `KpiStaffSelector` | Same superseded-reviewer-admin situation. |
| `KpiTicketsBoard.tsx` | `KpiTicketsBoard` | No importers; live tickets UI uses `KpiDeveloperTicketQueue`/`KpiReporterTicketView` instead. |

### 2.19 `layout/AuthenticatedLayout.tsx` (1)
No real importers — app layout selection happens via `DashboardLayout`/`ClientLayout`/`AcademyLayout` used directly in pages, not through this wrapper.

### 2.20 `membership/StageStatusControl.tsx` (1)
No importers, no barrel.

### 2.21 `package-builder/*` (2)
| File | Symbol | Reason |
|---|---|---|
| `DependencyWarningDialog.tsx` | `DependencyWarningDialog` | No importers. |
| `MergeFieldHelper.tsx` | `MergeFieldHelper` | No importers. |

### 2.22 `portfolio/*` (2)
| File | Symbol | Reason | Git-history context |
|---|---|---|---|
| `PortfolioSummaryTiles.tsx` | `PortfolioSummaryTiles` | No importers, no barrel. | — |
| `PortfolioTable.tsx` | `PortfolioTable` | No importers. | Independently flagged orphaned alongside `ConsultantAssignmentCard.tsx` in the `2026-07-27-csc-assignment-silent-failure.md` audit entry. |

### 2.23 `risk/RiskRadarPanel.tsx` (1)
No importers anywhere.

### 2.24 `src/components/stage/*` — safe subset (3)
| File | Symbol | Reason |
|---|---|---|
| `EvidenceGapCheckPanel.tsx` | `EvidenceGapCheckPanel` | No importers. |
| `EvidenceGapCSCView.tsx` | `EvidenceGapCSCView` | No importers. |
| `TASContextAssistant.tsx` | `TASContextAssistant` | No importers. |

(`StageCompletenessWidget.tsx` and `StageHealthPanel.tsx` are in §3, not here.)

### 2.25 `task-notes/FocusMode.tsx` (1)
No importers — its re-exported `date-fns` `startOfWeek` is dead by extension.

### 2.26 `src/components/tenant/*` (8) — unwired tenant-panel cluster
| File | Symbol | Reason |
|---|---|---|
| `AuditIntelligencePackPanel.tsx` | `AuditIntelligencePackPanel` | No importers; only out-of-scope KB/audit-log planning notes. |
| `PublicComplianceSnapshotPanel.tsx` | `PublicComplianceSnapshotPanel` | No importers. |
| `TenantBurnForecastPanel.tsx` | `TenantBurnForecastPanel` | No importers. |
| `TenantCommercialHealthPanel.tsx` | `TenantCommercialHealthPanel` | No importers. |
| `TenantPlaybooksPanel.tsx` | `TenantPlaybooksPanel` | No importers. |
| `TenantRiskForecastPanel.tsx` | `TenantRiskForecastPanel` | No importers. |
| `TenantRiskProfilePanel.tsx` | `TenantRiskProfilePanel` | No importers. |
| `TenantStageHealthSummary.tsx` | `TenantStageHealthSummary` | No importers; only a KB design-doc mention (see §4 re: `StageHealthPanel.tsx`). |

Whole `tenant/*Panel.tsx` cluster is unwired to any route — safe as one batch.

### 2.27 `src/components/ui/*` — unused shadcn/ui scaffold primitives (17)
| File | Symbol | Reason |
|---|---|---|
| `achievement-badge.tsx` | `AchievementBadge` | No importers; only a docs example. |
| `animated-tabs.tsx` | `AnimatedTabs` | No importers; only docs mentions. |
| `aspect-ratio.tsx` | `AspectRatio` | No importers (SVG `preserveAspectRatio` substring hits are false positives). |
| `breadcrumb.tsx` | `Breadcrumb` + subcomponents | No importers — every page with breadcrumbs hand-rolls its own. |
| `carousel.tsx` | `Carousel` + subcomponents | No importers (embla-carousel dependency is unused by extension — outside this audit's scope). |
| `chart.tsx` | `ChartContainer`/`ChartTooltip`/`ChartLegend`/`ChartStyle` | No importers — all chart-heavy pages import `recharts` directly instead. |
| `context-menu.tsx` | `ContextMenu` + exports | No importers — unmodified scaffold. |
| `data-table-empty.tsx` | `DataTableEmpty` | No importers (docs example only). |
| `error-display.tsx` | `ErrorDisplay` | No importers (docs example only). |
| `forms.ts` | whole file (barrel) | No importers — the one plausible consumer (`QAResponsiveHarness.tsx`) imports `form-primitives` directly instead. |
| `input-otp.tsx` | `InputOTP` + exports | No importers — app has no OTP/2FA flow. |
| `menubar.tsx` | `Menubar` + exports | No importers (only the underlying Radix dependency in package.json). |
| `navigation-menu.tsx` | `NavigationMenu` + exports | No importers (same pattern as menubar). |
| `print.tsx` | `PrintHeader`/`PrintWrapper`/etc. | No importers — the `docx` library's unrelated `PageBreak` class is a false-positive lookalike, not this component. |
| `sidebar.tsx` | `Sidebar` + `useSidebar` | No importers — app nav lives in `layout/*` instead. |
| `stage-steps.tsx` | `StageSteps` | No importers. |
| `use-toast.ts` | `useToast`/`toast` | No importers — all ~300 call sites import `@/hooks/use-toast` directly; this is an orphaned scaffold duplicate. |

### 2.28 `workboard/ClientWorkboardTab.tsx` (1)
No importers anywhere.

### 2.29 `src/pages/**` (8) — dead pages / route-orphaned wrappers
| File | Symbol | Reason | Git-history context |
|---|---|---|---|
| `admin/TeamReassignmentPage.tsx` | same | No route, no import. | — |
| `AdminAiFeatureFlags.tsx` | same | No route, no import. | — |
| `AdminDocumentAIReview.tsx` | same | No route, no import. | — |
| `AdminManagePackagesWrapper.tsx` | same | Not the component mounted at `/admin/manage-packages` — that route mounts `PackageBuilder` instead (see §4). | — |
| `client/ClientNewSuggestionWrapper.tsx` | same | Not in `App.tsx`'s client route block. | Suggestion & Issue Register feature was consolidated into Support Tickets. |
| `client/ClientSuggestionDetailWrapper.tsx` | same | Not in `App.tsx`'s client route block. | Part of the same orphaned client-portal Suggestions cluster. |
| `client/ClientSuggestionsWrapper.tsx` | same | Not in `App.tsx`'s client route block. | Same cluster. |
| `TenantDetailWrapper.tsx` | same | No importers. | `App.tsx:45` carries an explicit comment: "TenantDetailWrapper removed — consolidated into `ClientDetailWrapper`." File itself was never deleted. Not to be confused with `AdminPackageTenantDetailWrapper` (live, distinct — see §4). |

### 2.30 `src/hooks/**` — safe subset (12)
| File | Symbol | Reason | Git-history context |
|---|---|---|---|
| `academy/useVideoLibrary.ts` | `useVideoLibrary`, `useVideoFolders`, `useVideoAssignments` | No importers. **Not the same as `useVideoLibraryPicker`** (`useAcademyBuilderPickers.ts`), which is live in `LessonEditorPanel.tsx`. | — |
| `useCompletionCascade.ts` | `useCompletionCascade` | No importers — never-wired-up celebration/engagement feature family. | — |
| `useDashboardData.tsx` | `useDashboardData` | No importers. | — |
| `useDocumentAcknowledgements.ts` | `useDocumentAcknowledgements` | No importers; `document_acknowledgements` table exists in schema but nothing calls this hook. | — |
| `useEngagementSettings.ts` | `useEngagementSettings` | No importers — its own JSDoc claims consumers that don't actually import it (stale comment). | — |
| `useEosScorecardMetrics.tsx` | `useEosScorecardMetrics` (this file only) | **Do not confuse with the same-named export in `useEos.tsx`, which is load-bearing** (used by `LiveMeetingView.tsx`). This file is a dead backward-compat re-export shim with zero importers of its own path. | — |
| `useGeneratedDocuments.tsx` | `useGeneratedDocuments` | No importers — real consumers of the `generated_documents` table query it directly instead. | — |
| `useMeetingLifecycle.tsx` | `useMeetingLifecycle` | No importers; the `complete_meeting_with_carry_forward` RPC it wraps has no other frontend caller either — confirmed no live carry-forward flow exists at all. | — |
| `useRecoveryCelebration.ts` | `useRecoveryCelebration` | No importers. | — |
| `useRiskCelebration.ts` | `useRiskCelebration` | No importers. | — |
| `useTenantRtoScope.tsx` | `useTenantRtoScope` + 4 other exports | No importers; `useTgaRtoData.tsx` independently queries the same table directly and is the live path. | Migration `20260818090000_security_definer_full_sweep_fixes.sql` comments name this hook as historical RPC caller only. |
| `useTgaIntegration.tsx` | `useTgaIntegration`, `TGACacheItem`, `TGAImportJob` | No importers; `useTgaRtoData.tsx` defines its own local `TGAImportJob` (coincidental name collision, not a hidden dependency). | — |

(`useDocumentAIConfidence.tsx` is in §3, not here.)

### 2.31 `src/features/pdp/components/*` (2)
| File | Symbol | Reason |
|---|---|---|
| `EvidenceSheet.tsx` | `EvidenceSheet` | No importers — live PDP flow uses `AddEvidenceSheet.tsx` (`components/academy/pdp/`) instead. |
| `GoalSheet.tsx` | `GoalSheet` | No importers — live PDP flow uses `AddGoalSheet.tsx` instead. |

### 2.32 `src/lib/*` — safe subset (4)
| File | Symbol | Reason |
|---|---|---|
| `logger.ts` | whole file | No importers — CONTRIBUTING.md documents this as the recommended pattern but it was never adopted. Pair removal with a CONTRIBUTING.md update, or implement the pattern instead of deleting (a docs/process call, not a risk call). |
| `validation-schemas.ts` | whole file | Same situation as `logger.ts` — documented-but-unadopted pattern. |
| `emit-celebration.ts` | `emitCelebration` | No importers — the live celebration system (`celebration.tsx`/`celebration-engine.ts`) is purely client-side canvas fireworks and never calls this DB-persistence path. |
| `addinAudit.ts` | 4 exported functions | No importers anywhere; only an internal intra-file call chain. |

### 2.33 `src/utils/clickup-import-mappings.ts` (1)
No importers — abandoned frontend-side duplicate of the server-side CSV allowlist (`supabase/functions/import-clickup-csv/clickup-csv-allowlist.ts`, which is a separate, independent implementation).

### 2.34 `src/integrations/tga/tga_endpoints.ts` (1)
No importers — the two edge functions with similar constants (`get-organisation-details`, `tga-sync`) hardcode their own independent copies; no frontend code makes direct TGA SOAP calls.

### 2.35 `supabase/functions/**` — already-retired 410 stubs (7)
| Function | Reason | Git-history context |
|---|---|---|
| `create-session` | 410 stub, header: "RETIRED — Unicorn security audit C1 (14 Jul 2026)". Zero callers. | — |
| `create-session-v2` | Byte-identical 410 stub, same retirement. | — |
| `auth-send-magic-link` | 410 stub — live login flow uses `supabase.auth.signInWithOtp` instead. | — |
| `admin-reset-user` | 410 stub — superseded by `generate-recovery-link`/`send-password-reset`. | — |
| `auth-generate-password-reset` | 410 stub — superseded by `send-self-password-reset`. | — |
| `schedule-task-reminders` | Self-documented 410 stub: "RETIRED 2026-08-18 ... Safe to delete entirely." | `docs/audit-log/entries/2026-08-17-schedule-task-reminders-cron-auth.md` documents an exhaustive `git log --all -S`/pg_cron/trigger search finding zero callers ever; target table had 0 production rows. |
| `tmp-backfill-sharepoint-drive-ids` | Self-documented one-off backfill stub, already ran and verified, no credentials remain. | `docs/edge-function-remediation-handoff.md` corroborates as already retired. |

---

## 3. Needs manual review before removing

### 3.1 Frontend (4)

| File | Symbol | What needs a human decision |
|---|---|---|
| `src/components/stage/StageCompletenessWidget.tsx` | `StageCompletenessWidget` | No live import found, but `docs/audit-report-2026-08-26.md` explicitly documents this as the frontend caller of the `calculate-phase-completeness` edge function as of the 25-Aug security pass. **Confirm via git blame/history whether the page that rendered this was itself recently removed/orphaned** before deleting — deleting it also stands up the question of whether `calculate-phase-completeness` has any other caller. |
| `src/components/stage/StageHealthPanel.tsx` | `StageHealthPanel` | No live import found, but a KB design doc (`docs/kb/reference/dashboard-overhaul-mockup.md`) treats this panel's `health_status`-derivation logic as canonical, citing it alongside `TenantStageHealthSummary.tsx` (also dead, §2.26) in the same breath. **Confirm neither component's business logic needs to be ported somewhere else** before both are deleted — otherwise the health-status computation rules (open/overdue tasks, high-risk events, evidence gaps, days-since-activity) are lost with no replacement. |
| `src/hooks/useDocumentAIConfidence.tsx` | `useDocumentAIConfidence`, `DocumentAIData`, `AIStatus`, **and `useDocumentAIStatusCounts`** | The named hook is confirmed dead, but the file also exports a second hook (`useDocumentAIStatusCounts`) not in the original candidate list, which independently also has zero importers but was **not separately verified**. It also wraps three live RPCs (`apply_document_ai_analysis`, `approve_document_ai_suggestions`, `reject_document_ai_suggestions`) — **confirm via Supabase RPC lookup that no edge function or other frontend surface calls these** before deleting the whole file. |
| `src/lib/microsoft/scopes.ts` | `buildScopeString`, `BASE_SCOPES`, `MAIL_SCOPES`, `CALENDAR_SCOPES`, `DOCUMENT_SCOPES`, `SurfaceFlags` | Zero frontend importers, but a near-identical Deno duplicate (`supabase/functions/_shared/microsoft-scopes.ts`) is the one actually wired into `outlook-auth`. **Confirm with whoever owns the Microsoft 365 add-in auth work** whether this frontend file was meant to become a shared source of truth, or is slated for an OAuth-connect UI not yet built, before deleting. |

### 3.2 Edge functions — deployed and live, no in-repo caller found (15)

These all pass the "zero grep hit in `src/**`/`supabase/functions/**`" bar, but each carries a specific reason a plain code search cannot settle the question. **None of these should be deleted on this synthesis alone.**

| Function | What needs a human decision |
|---|---|
| `compliance-assistant-client` | Function's own header states it's deliberately "left deployed but unmounted" pending a **planned future decommission** — confirm the observation period has elapsed before deleting; deleting now would preempt an already-stated team plan. |
| `bootstrap-bulk-generate-system-account` | Self-identifies as intentionally neutralised/retained on purpose ("kept only as an inert placeholder for the slug") — confirm the reason for keeping the placeholder no longer applies. |
| `assign-package-to-tenant` | **Live, documented disagreement**: a 2026-08-18 security-audit guardrail explicitly says "Do not merge #323 retiring `assign-package-to-tenant` ... external/manual callers have not been ruled out," yet PR #323 (commit `c24c52d4`) retiring it to a 410 stub *was* merged the same day. The stub already ships in production; the open question is only whether the **source file** should now be deleted outright, given the standing unresolved "external callers not ruled out" concern. |
| `academy-fetch-vimeo-showcase` | Fully live, working, Super-Admin-JWT-gated implementation (not a stub) with real API logic — no self-documented retirement marker. Confirm whether a "preview before import" UX (separate from the shipped `academy-import-vimeo-showcase` one-shot flow, commit `6661c427`) is still planned. |
| `generate-audit-report` | `docs/edge-function-remediation-handoff.md` explicitly frames this as an **open policy decision** (U5): the team's stated rule is that usage/row-count evidence alone is insufficient to conclude retirement for this function — a workflow decision from Carl is required regardless of grep results. |
| `admin-change-password` | Actively deployed and recently security-hardened (not touched to add a caller) — reads as maintained for an out-of-repo admin/ops tool. Confirm with whoever owns external admin tooling. |
| `invite-to-tenant` | A recent (2026-08-18) migration fixing `user_invitations` RLS/trigger logic explicitly names this function as one of only three current valid INSERT paths into that table — DB-side logic depends on its continued correctness even though no frontend caller was found. Confirm no external caller exists before removing. |
| `get-email-status` | Weakest keep-signal of this group (no `config.toml` hardening comment, no DB dependency) — but still a live production function reading `email_sends` by ID, plausibly polled by an external status-check integration invisible to a repo grep. |
| `report-delivery-issue` | Same profile as `get-email-status`; request shape looks like a possible external email-provider delivery-issue webhook target rather than a frontend-called function. |
| `import-vimeo-training` | Superseded in code by `backfill-vimeo-durations`/`academy-import-vimeo-showcase`/`academy-fetch-vimeo-showcase`/`academy-fetch-vimeo-transcript`, and other functions only cite it as an auth-pattern precedent in comments (not a functional caller) — reads like a finished one-off admin script, but no owner confirmation obtained that its use case is complete. |
| `validate-ai-assist` | Self-documents as intentionally-built-ahead API surface for a not-yet-wired "Sprint 3 AI layer" (Addendum §3.3/§3.7) UI, sourcing from currently-empty `tga_scope_units`/`tga_units` tables. Confirm whether that Sprint 3 frontend work is still planned. |
| `mailgun-webhooks` (plural) | Externally-triggered webhook — an internal grep can never prove liveness for either this or the singular `mailgun-webhook`. **`MAILGUN_SETUP.md` (this repo's own setup instructions) tells whoever configures Mailgun to point at the plural URL**, directly contradicting the 2026-08-18 security audit's claim that only the singular was "re-verified live." This is a real, pre-existing contradiction — resolve by checking Mailgun's actual configured webhook target externally, not from source. |
| `tga-product-lookup` | Hardened and deployed as part of a 9-function remediation batch on 2026-08-18, but unlike its sibling `tga-rto-sync` (where two specific frontend callers were named), **no specific caller was individually substantiated** for this one in that same audit entry. May be planned-but-unwired functionality (like `tga-rto-import`/`tga-rto-preview`) rather than truly dead. |
| `test-mailgun` | Explicit carried-forward open item (U2) from a prior audit pass — self-documents as a SuperAdmin-only manual diagnostic tool that could be invoked directly via curl/Postman by an operator, which a source-only audit cannot rule out. |
| `academy-backfill-course-thumbnails` | Same carried-forward open item (U2) as `test-mailgun` — CORS-hardened without a lifecycle decision because "a quiet log window and no tracked UI call cannot prove a manual workflow is retired." |

---

## 4. False positives (keep) — do not re-flag these

These surfaced during verification as similarly-named or thematically-adjacent to a real dead-code candidate, but are confirmed live. Listed here so a future automated pass doesn't waste a cycle re-investigating them:

| Name | Why it looks dead | Why it's actually live |
|---|---|---|
| `AlignmentSignalsPanel.tsx` | Similar name to dead `SignalsPanel.tsx` | Imported and rendered by `ExecutiveDashboard.tsx`. |
| `useVideoLibraryPicker` (`useAcademyBuilderPickers.ts`) | Similar name to dead `useVideoLibrary.ts` | Imported by `LessonEditorPanel.tsx`. |
| `useTgaRtoData.tsx`, `useTgaSync.tsx` | Overlap with dead `useTenantRtoScope.tsx`/`useTgaIntegration.tsx` | The actual live TGA integration path, used by `ClientIntegrationsTab.tsx`/`AdminTgaIntegration.tsx`. |
| `GeneratedDocumentsTab.tsx`'s local `GeneratedDocument` interface | Substring match on dead `useGeneratedDocuments.tsx`'s `GeneratedDocument` type | Independent, locally-defined interface — no import relationship. |
| `MetricEditorDialogV2` (`scorecard2/`) | Successor to dead `MetricEditorDialog.tsx` | Live, imported by `EosScorecard.tsx`. |
| `AddEvidenceSheet.tsx` / `AddGoalSheet.tsx` (`components/academy/pdp/`) | Successors to dead `features/pdp/components/EvidenceSheet.tsx`/`GoalSheet.tsx` | Live, imported by the PDP cycle tabs. |
| `ImpactReportView.tsx` / `ImpactReportCard.tsx` | Only reachable via the dead `client-impact/index.ts` barrel | Imported directly by their consuming pages, bypassing the barrel. |
| `FacilitatorChecklist`/`FacilitatorPrompts`/`RocksInsights` | Only reachable via the dead `eos/facilitator/index.ts` barrel | Imported directly by `LiveMeetingView.tsx`. |
| `PackageBuilder` (mounted at `/admin/manage-packages`) | Route name resembles dead `AdminManagePackagesWrapper.tsx` | The route mounts a different, distinct component. |
| `ClientDetailWrapper.tsx`, `AdminPackageTenantDetailWrapper.tsx` | Similar names to dead `TenantDetailWrapper.tsx` | Both distinct, both live and routed. |
| `useAcademyDashboardStats` | Substring match on dead `DashboardStats.tsx` | Distinct hook, used by `AcademyDashboardPage.tsx`. |
| `HomeRecentActivitySection`/`feed.recentActivity` | Substring match on dead `RecentActivity.tsx` | Distinct, live in `ClientHomePage.tsx`. |
| `PageBreak` (npm `docx` library, used in `generate-client-audit-report-docx`) | Substring match on dead `ui/print.tsx`'s `PageBreak` | Entirely different symbol from a different package. |
| `preserveAspectRatio` (SVG attribute in logo assets) | Substring match on dead `AspectRatio` component | Not a code reference at all. |
| `useProgressAnchors` hook | Substring match on dead `ProgressAnchors.tsx` component | Distinct, presumably-live utility — do not conflate. |
| `ACADEMY_ONLY_ROUTES` (`navigationConfig.ts`) | Same file/section as the removed Academy tier model | **Confirmed live** — consumed by `ProtectedRoute.tsx` for an unrelated `hasAcademyOnly` access-scope redirect. A prior sub-agent's report incorrectly claimed this had zero importers; caught before deletion once already. |
| `TenantTypeContext.tsx`'s `academyTier`/`AcademyTier`/`isAcademyMember`/`isComplianceMember` | Now has zero remaining consumers after the Academy-tier removal | **Deliberately parked, not to be touched this pass** — the Aug-27 audit entry explicitly scoped this out as schema-adjacent follow-up work belonging in its own session. |
| `COMPLIANCE_ONLY_ROUTES` (`navigationConfig.ts`) | Confirmed zero importers | Deliberately left untouched by the prior Academy-tier removal session — same file, same governance call needed before touching. |

---

## 5. Suggested removal order

Sized for separate, reviewable PRs, lowest-risk/no-dependency first.

**Batch 1 — Retired edge-function stubs (7 functions, §2.35).**
Zero risk: these already return HTTP 410 in production. Deleting the source directories has no runtime effect. One PR, `chore:` branch.

**Batch 2 — Unused shadcn/ui scaffold primitives (17 files, §2.27).**
Pure UI library dead code, zero app logic depends on it. One PR. Consider also removing the now-unused `embla-carousel` dependency as a fast-follow (out of this audit's scope, flagged only).

**Batch 3 — Orphaned barrel/index files (2 files, §2.6).**
Trivial, zero-dependency. Can ride along with Batch 2 or its own tiny PR.

**Batch 4 — Unused data-layer hooks (12 files, §2.30).**
Slightly higher attention needed than UI-only removals since hooks can have subtle RPC/table coupling — but all 12 were independently re-verified with no live caller. One PR.

**Batch 5 — Orphaned EOS review-pane cluster (19 files, §2.14).**
Large but coherent and independently verified as one legacy iteration superseded by `scorecard2`/`facilitator`. One PR.

**Batch 6 — Orphaned Executive dashboard widgets (8 files, §2.15).**
One PR — verify `ExecutiveDashboard.tsx`'s render tree once at PR time to be sure none of these are dynamically referenced (none were found to be, but this is a live, high-visibility dashboard).

**Batch 7 — Orphaned document/Excel/release-readiness cluster (13 files, §2.12) + BulkGenerateDialog (§2.13).**
One PR — this is a single abandoned "document release readiness" sub-feature plus the superseded top-level bulk-generate dialog.

**Batch 8 — Orphaned client-portal component cluster (11 files, §2.5) + ClientAICompanionPanel (§2.7) + orphaned client pages (3 files, §2.29).**
One PR. This is the highest-touch area from a user-facing-risk perspective (client-portal surface), even though every file is independently confirmed to have zero route/import path.

**Batch 9 — Orphaned tenant-panel cluster (8 files, §2.26).**
One PR — but see §3 first: confirm `StageHealthPanel.tsx`'s logic isn't needed before this batch, since `TenantStageHealthSummary.tsx` is cited alongside it in the same KB doc.

**Batch 10 — Orphaned KPI reviewer-admin cluster (3 files, §2.18) + remaining dead pages (5 files, §2.29 minus the 3 already in Batch 8).**
One PR.

**Batch 11 — Remaining single-file/small-cluster components (audit, billing/capacity, compliance, consultant, dashboard, governance, help-center, layout, membership, package-builder, portfolio, risk, stage-safe-subset, task-notes, workboard, top-level misc, academy/admin, admin) — roughly 45 files.**
Lowest interdependency risk (each independently confirmed zero-importer), but grouped last only because it's a grab-bag spanning many unrelated areas — split into 2–3 PRs by rough functional area if reviewers prefer smaller diffs (e.g. "admin/invite cluster" vs "everything else").

**Batch 12 — PDP superseded components (2 files, §2.31) + lib/utils/integrations cleanup (7 files, §2.32–2.34).**
One PR. Pair the `logger.ts`/`validation-schemas.ts` removal with either a CONTRIBUTING.md update (drop the now-false claim these are the recommended pattern) or leave a one-line note — Carl's call.

**Not batched — hold for explicit sign-off (§3 items):**
`StageCompletenessWidget.tsx`, `StageHealthPanel.tsx`, `useDocumentAIConfidence.tsx` (+ `useDocumentAIStatusCounts`), `microsoft/scopes.ts`, and all 15 needs-review edge functions. These should not enter any batch until the specific human decision each one lists in §3 has been made.

---

## 6. Post-removal verification plan

This section is the checklist for the **execution + Playwright-verification pass** for each batch.

**Batch 1 (retired stubs):** No manual smoke test needed — they already 410 in prod. Playwright: none required; optionally confirm `npm run build` succeeds and `supabase/functions/**` function count in `list_edge_functions` drops by 7 after deploy.

**Batch 2 (shadcn primitives) + Batch 3 (barrels):** Manual: `npm run build` and `npx vitest run` clean. Playwright: full-app smoke — load Dashboard, Client Portal home, EOS Live Meeting view, Executive Dashboard, Academy Course Detail, and any page with breadcrumbs (TopBar, AcademyTopBar, AuditWorkspaceNew) to confirm nothing regresses visually (these all hand-roll their own breadcrumb UI, unaffected, but worth a visual pass since `breadcrumb.tsx` touches a common import path pattern).

**Batch 4 (hooks):** Manual: grep-confirm no residual imports post-deletion (`npm run lint`/`tsc` will catch broken imports immediately — treat any new TS error as a stop-ship signal). Playwright: exercise `CompliancePulseBanner` (client portal home) since it shares the `useClientActivityTimeline` hook with the deleted `ActivityTimeline` component — confirm the banner still renders activity data correctly.

**Batch 5 (EOS review-pane cluster):** Manual: full EOS meeting lifecycle click-through. Playwright: navigate to a Live EOS Meeting (`LiveMeetingView`), run through Scorecard entry (`scorecard2`), Rocks review, and Minutes finalisation end-to-end; confirm no console errors referencing removed pane components.

**Batch 6 (Executive widgets):** Manual + Playwright: load `/executive` (or the routed Executive Dashboard path) and confirm every remaining widget (`AlignmentSignalsPanel`, `StrategicHealthSnapshot`, `ExecutionMomentumPanel`, `OwnerPressureTable`, etc.) still renders with no missing-import console errors.

**Batch 7 (document/Excel/release cluster):** Manual: Manage Documents, Manage Stages, Admin Stage Detail pages. Playwright: click through `StageDocumentsPanel` — confirm `ExcelBindingStatusBadge`/`DocumentReadinessBadge` still render correctly (they share the `useExcelBindings`/`useExcelDataSources`/`useDocumentReadiness` hooks with the deleted tab components — hooks are being kept, only the unused tab UI is removed).

**Batch 8 (client-portal cluster):** Highest-priority verification given user-facing surface. Manual: log in as the demo RTO client test account (see Memory: `carl+demo@vivacity.com.au`), click through every client-portal tab/section (Documents, Notes, Progress, Home, Suggestions link if any remains). Playwright: full client-portal navigation crawl — Client Home, Client Documents tab, Client Notes tab, any Suggestions-related nav link (confirm it 404s gracefully or was already removed, not left dangling).

**Batch 9 (tenant panels):** Manual: confirm no admin/tenant-detail page references any deleted panel. Playwright: load a Tenant Detail page (`ClientDetailWrapper`) and confirm it renders fully with no console errors.

**Batch 10 (KPI + pages):** Manual: `/kpi` and `/my/kpi` pages, staff Suggestion Register / Suggestion Detail pages (non-client side, confirm unaffected). Playwright: click through `/kpi` Team KPI toggle, ticket queue views.

**Batch 11 (grab-bag):** Manual: spot-check each functional area touched (Admin invites page, Audits page, Compliance score views, Consultant workload area if any remaining nav entry, Package Builder, Portfolio view, Risk Radar nav entry, Task Notes). Playwright: targeted navigation to each surviving parent page in this group, confirm no console errors.

**Batch 12 (PDP + lib/utils):** Manual: PDP cycle flow (Goals tab, Evidence tab) end-to-end for a test user. Playwright: Academy PDP cycle — add a goal, add evidence, confirm `AddGoalSheet`/`AddEvidenceSheet` (the live successors) still function correctly.

**Cross-cutting, every batch:** run `npm run lint` and `npx vitest run` before merge (accepting the documented pre-existing baseline failures noted in AGENTS.md, but treating any *new* failure as a regression); run `npm run build` to catch any import broken by the deletion that `tsc`/eslint's current noisy baseline might mask.

---

## 7. Open questions

1. **No Vivacity Coaching / ComplyHub.ai entity ambiguity found.** Every candidate here is Unicorn 2.0 / ComplyHub.ai product code — nothing in this pass touches Vivacity Coaching & Consulting billing, contracts, or client-facing consulting content, so no entity-routing decision is needed for this cleanup itself.

2. **`assign-package-to-tenant`:** there is a genuine, documented conflict between a security-audit guardrail ("do not merge #323... callers not ruled out") and the fact that PR #323 retiring it to a 410 stub *was* merged. Carl should confirm whether the "external/manual callers not ruled out" concern was ever separately closed out before the source file (not just the stub behaviour) is deleted.

3. **`mailgun-webhooks` vs `mailgun-webhook` (singular):** the repo's own `MAILGUN_SETUP.md` instructs pointing Mailgun at the *plural* URL, contradicting the 2026-08-18 security audit's claim that only the *singular* was re-verified live. This can only be resolved by checking Mailgun's actual dashboard-configured webhook target — an external system this session has no visibility into. Needs Carl (or whoever holds Mailgun dashboard access) to check before either function is touched.

4. **`generate-audit-report`:** the team has an explicit standing policy (`docs/edge-function-remediation-handoff.md`, item U5) that usage evidence alone cannot settle retirement for this function — a workflow decision is required regardless of what any future grep finds. Carl needs to explicitly rule whether the `client_audits`-based report path has fully superseded this.

5. **`validate-ai-assist` and `academy-fetch-vimeo-showcase`:** both read as intentionally-built-ahead of a not-yet-shipped frontend feature (Sprint 3 AI layer; a Vimeo showcase preview step) rather than abandoned code. Worth a quick "is this still on the roadmap?" check before either is touched — deleting genuinely-planned scaffolding is a different mistake than deleting genuinely-dead code, and this synthesis can't tell them apart from source alone.

6. **`test-mailgun` / `academy-backfill-course-thumbnails`:** both are explicitly-flagged-but-deferred operator tools from a prior audit pass (item U2) — the standing question ("can a manual/operator workflow be proven retired from source alone?") was never answered, not newly raised here. Carl is the only person who can confirm whether these manual entry points have actually gone unused, since that's an operational fact, not a code fact.

7. **`admin-change-password` / `invite-to-tenant` / `get-email-status` / `report-delivery-issue` / `import-vimeo-training` / `tga-product-lookup`:** all six are live, deployed, no-in-repo-caller functions where the most likely explanation is an out-of-repo caller (admin tooling, a webhook target, an ops script) that this audit has no way to see. Recommend Carl (or whoever owns any Zapier/ops/admin-tool integrations against this Supabase project) do a one-time check of what actually calls these before any of the 19 needs-review items move to a removal PR.

8. **`StageHealthPanel.tsx` / `TenantStageHealthSummary.tsx`:** both dead as components, but a KB dashboard-overhaul mockup doc treats their `health_status`-derivation logic as canonical reference material for a not-yet-built dashboard feature. Worth confirming with whoever owns that mockup whether the logic needs porting somewhere before the source is deleted.

---

## Execution log

*Updated as each batch ships.*

- **2026-08-27:** Plan authored (this doc). Baseline LOC captured. Starting Batch 1.
- **2026-08-27:** Batch 1 shipped — 7 retired edge-function stubs deleted (`create-session`, `create-session-v2`, `auth-send-magic-link`, `admin-reset-user`, `auth-generate-password-reset`, `schedule-task-reminders`, `tmp-backfill-sharepoint-drive-ids`) plus their stale `supabase/config.toml` stanzas. Independently re-verified each retirement marker and zero-caller status before deleting. `npm run build` clean. **Note:** these were already deployed as HTTP 410 stubs in production Supabase — deleting the source here does not undeploy them; if Carl wants them fully removed from the live Supabase project (not just the repo), that's a separate manual step via the Supabase dashboard, since no MCP tool here can delete a deployed edge function. PR #424 merged; Carl manually deleted all 7 from the Supabase dashboard same day — verified gone via `list_edge_functions` (213 functions remaining, none of the 7 present).
- **2026-08-27:** Batch 2 shipped — 17 unused shadcn/ui scaffold primitives deleted (achievement-badge, animated-tabs, aspect-ratio, breadcrumb, carousel, chart, context-menu, data-table-empty, error-display, forms barrel, input-otp, menubar, navigation-menu, print, sidebar, stage-steps, use-toast). Independently re-verified zero importers (aliased + relative import forms, ruled out substring false-positives). `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed.
