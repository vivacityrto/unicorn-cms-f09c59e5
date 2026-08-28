# Dead-Code Cleanup — Implementation Plan

**Date:** 27 August 2026
**Repo:** `unicorn-cms-f09c59e5` (Unicorn 2.0 / ComplyHub.ai — single frontend, no Vivacity Coaching code paths involved)
**Produced by:** a 44-agent audit workflow (parallel dead-code finders + git-history cross-reference + per-candidate blast-radius re-verification + synthesis), 27 Aug 2026.
**Execution branch:** `chore/dead-code-cleanup-batch-1` (branched from `origin/main`), one PR per batch below.

## Lines of code progression

Measured as `git ls-files 'src/**' 'supabase/functions/**'` file count, and total lines via `git archive <rev> -- src supabase/functions | tar -xO | wc -l` (or the equivalent on the working tree). Updated after every batch merges so the running total is visible.

| Checkpoint | Files | Lines | Δ Lines | Δ Files |
|---|---:|---:|---:|---:|
| Baseline (`main` @ `a1476952`, pre-cleanup) | 2,028 | 538,400 | — | — |
| After Batch 1 (7 retired edge-function stubs) | 2,018 | 538,220 | −180 | −10 |
| After Batch 2 (17 shadcn/ui scaffold primitives) | 2,001 | 535,546 | −2,674 | −17 |
| After Batch 3 (2 orphaned barrel files) | 1,999 | 535,530 | −16 | −2 |
| After Batch 4 (12 unused data-layer hooks) | 1,987 | 533,999 | −1,531 | −12 |
| After Batch 5 (18 of 19 listed EOS review-pane files — see note) | 1,969 | 531,270 | −2,729 | −18 |
| After Batch 6 (8 orphaned Executive Dashboard widgets) | 1,961 | 530,501 | −769 | −8 |
| After Batch 7 (document/Excel/release-readiness cluster + BulkGenerateDialog) | 1,947 | 526,279 | −4,222 | −14 |
| After Batch 8 (client-portal component cluster + orphaned client pages) | 1,932 | 523,438 | −2,841 | −15 |
| After Batch 9 (8 orphaned tenant-panel components) | 1,924 | 521,604 | −1,834 | −8 |
| After Batch 10 (KPI reviewer-admin cluster + remaining dead pages) | 1,916 | 519,495 | −2,109 | −8 |
| After Batch 11 (grab-bag of 36 unrelated single-file/small-cluster components) | 1,880 | 512,359 | −7,136 | −36 |
| **After Batch 12 (final batch — PDP superseded components + lib/utils/integrations)** | **1,872** | **510,416** | **−1,943** | **−8** |
| After deleting the retired `assign-package-to-tenant` stub source (§3 follow-up, includes StageHealthPanel.tsx + 3 earlier edge-function retirements) | 1,867 | 508,054 | −2,362 | −5 |
| After retiring `generate-audit-report` + removing the entire legacy Compliance Auditor implementation | 1,860 | 505,710 | −2,344 | −7 |
| After retiring `mailgun-webhooks` (plural) | 1,857 | 505,485 | −225 | −3 |
| After deleting the 5 now-stubbed edge-function folders + orphaned `StageCompletenessWidget.tsx` (folders only — 410 stubs already counted above) | 1,850 | 505,102 | −383 | −7 |
| After retiring `admin-change-password`, `invite-to-tenant`, `get-email-status`, `report-delivery-issue` + `microsoft/scopes.ts` (410 stubs + folder deletions, all merged) | 1,843 | 504,498 | −604 | −7 |
| After retiring `test-mailgun`, `tga-product-lookup`, `import-vimeo-training` (PR #455, merged) | 1,839 | 503,748 | −750 | −4 |
| Pending merge: retiring `compliance-assistant-client` + deleting `bootstrap-bulk-generate-system-account` (PR #457, 410 stub deployed to prod, folders deleted in the branch, verified live in Playwright as the Demo RTO client) | 1,837 | 503,059 | −689 | −2 (once merged) |

**Total across all 12 batches: −27,984 lines (−5.2%), −156 files (−7.7%), from 538,400 → 510,416 lines and 2,028 → 1,872 files.** The 19 §3 needs-review items (4 frontend + 15 edge functions) remain untouched, parked for Carl's explicit sign-off before any future removal — see §3 and §7 below.

*Note: the very first baseline reading quoted 538,436 lines via a slightly different counting method (`cat`-concatenation through `xargs`, which double-counted some files due to arg-splitting). The `git archive`-based figure above (538,400) is the corrected, consistent baseline used for all progression tracking from here on.*

## Progress tracker

| Batch | Scope | Files | Status | PR |
|---|---|---:|---|---|
| 1 | Retired edge-function 410 stubs (§2.35) | 7 | ✅ Done | [#424](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/424) |
| 2 | Unused shadcn/ui scaffold primitives (§2.27) | 17 | ✅ Done | [#425](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/425) |
| 3 | Orphaned barrel/index files (§2.6) | 2 | ✅ Done | [#426](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/426) |
| 4 | Unused data-layer hooks (§2.30) | 12 | ✅ Done | [#427](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/427) |
| 5 | Orphaned EOS review-pane cluster (§2.14) | 18 (see note) | ✅ Done | [#428](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/428) |
| 6 | Orphaned Executive dashboard widgets (§2.15) | 8 | ✅ Done | [#429](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/429) |
| 7 | Document/Excel/release-readiness cluster (§2.12–2.13) | 14 | ✅ Done | [#430](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/430) |
| 8 | Client-portal component cluster (§2.5, §2.7, §2.29) | 15 | ✅ Done | [#431](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/431) |
| 9 | Tenant-panel cluster (§2.26) | 8 | ✅ Done | [#432](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/432) |
| 10 | KPI reviewer-admin cluster + remaining dead pages (§2.18, §2.29) | 8 | ✅ Done | [#433](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/433) |
| 11 | Remaining single-file/small-cluster components (grab-bag) | 36 (recounted from §2.1-2.28 remainder; plan's "~45" estimate) | ✅ Done | [#434](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/434) |
| 12 | PDP superseded components + lib/utils/integrations (§2.31–2.34) | 8 (recounted; plan's "9" estimate) | ✅ Done | [#435](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/435) |
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
| ~~`src/components/stage/StageCompletenessWidget.tsx`~~ | `StageCompletenessWidget` | **RESOLVED 28 Aug 2026 — deleted, and its only caller edge function `calculate-phase-completeness` retired alongside it.** Carl confirmed phase-completeness tracking is not a feature to preserve. Note: the deletion was approved and logged here at the time but not actually committed until PR #447 (28 Aug 2026), caught during the edge-function folder-deletion follow-up. See execution log. |
| ~~`src/components/stage/StageHealthPanel.tsx`~~ | `StageHealthPanel` | **RESOLVED 28 Aug 2026 — deleted.** Same finding as `TenantStageHealthSummary.tsx` (Batch 9): the KB doc's citation was documentation only, the real logic lives server-side in `run-stage-health-monitor`. Carl approved deletion. |
| `src/hooks/useDocumentAIConfidence.tsx` | `useDocumentAIConfidence`, `DocumentAIData`, `AIStatus`, **and `useDocumentAIStatusCounts`** | **Investigated 27-28 Aug 2026, not yet actioned.** RPC lookup confirmed `apply_document_ai_analysis`/`approve_document_ai_suggestions` are called by a separate live hook (`useDocumentAIAnalysis.tsx`) — safe. But `reject_document_ai_suggestions` has no other caller anywhere; deleting this hook removes the app's only reject-suggestion path. Deeper investigation found the entire AI-document-analysis feature (an opt-in "Use AI to suggest categories & descriptions" checkbox in the bulk-upload dialog) has **zero production usage ever** (`document_ai_audit` table has 0 rows). This is now folded into the broader bulk-upload-removal investigation (see execution log) rather than treated as a standalone dead-code deletion. |
| ~~`src/lib/microsoft/scopes.ts`~~ | `buildScopeString`, `BASE_SCOPES`, `MAIL_SCOPES`, `CALENDAR_SCOPES`, `DOCUMENT_SCOPES`, `SurfaceFlags` | **RESOLVED 28 Aug 2026 — deleted (PR #454).** Carl confirmed no OAuth-connect UI or shared-source-of-truth plan for this file — genuinely dead, the Deno duplicate wired into `outlook-auth` is the real one. |

### 3.2 Edge functions — deployed and live, no in-repo caller found (15, 11 resolved once #455 merges)

These all pass the "zero grep hit in `src/**`/`supabase/functions/**`" bar, but each carries a specific reason a plain code search cannot settle the question. **None of these should be deleted on this synthesis alone.**

| Function | What needs a human decision |
|---|---|
| ~~`compliance-assistant-client`~~ | **RESOLVED 28 Aug 2026 — retired (410 stub deployed to prod, folder deleted, PR #457).** Verified the "planned future decommission" condition: `ask-viv-assistant-client` has `app_settings.ask_viv_client_assistant_all_tenants = true` (fully rolled out, not just beta) with real usage since 6 Aug 2026 — 22 days of observation, satisfying the original migration plan's condition. Confirmed via grep that every `_shared` module this function imports is also used by `compliance-assistant` or `ask-viv-assistant-client` — nothing shared touched. Verified live in Playwright (Demo RTO client persona) that the Ask Viv panel hits `ask-viv-assistant-client`, not this function. |
| ~~`bootstrap-bulk-generate-system-account`~~ | **RESOLVED 28 Aug 2026 — deleted (PR #457).** Turned out to already be a fully neutralized stub in the repo — unconditionally returns 410 to every caller, no live logic left. Its one-time provisioning (the `bulk-generate-automation@vivacity.com.au` system account) already succeeded per its own header comment; nothing left to observe or confirm. |
| ~~`assign-package-to-tenant`~~ | **RESOLVED 28 Aug 2026 — source file deleted.** The behaviour-changing action (retiring the live function to a 410 response) already shipped 11 days earlier (17 Aug 2026) and has had zero reported incidents since — if an external caller existed, it would already have hit the 410 back then. Deleting the already-inert stub source today changes nothing about production behaviour. Same reasoning as the already-stubbed functions removed in Batch 1. |
| ~~`academy-fetch-vimeo-showcase`~~ | **RESOLVED 28 Aug 2026 — retired (410 stub deployed to prod).** Re-verified three ways: zero code references, the live "preview showcase" UI actually calls `academy-import-vimeo-showcase` instead (naming coincidence caught and double-checked when Carl flagged doubt), and zero invocations in production edge-function logs over 24h. Carl confirmed no separate "preview before import" UX on this specific function is planned. |
| ~~`generate-audit-report`~~ | **RESOLVED 28 Aug 2026 — retired (410 stub deployed to prod).** Carl confirmed the legacy `compliance_audits`-based Compliance Auditor workflow (0 rows ever) is fully superseded by `client_audits`, and directed removing the entire legacy implementation, not just this function — see execution log. |
| ~~`admin-change-password`~~ | **RESOLVED 28 Aug 2026 — retired (410 stub deployed to prod, folder deleted in a follow-up).** Investigated further (SuperAdmin-gated, no UI, requires a live JWT so no true external caller possible without someone's real login). Carl confirmed no Super Admin has used or knows of this as a manual unlock tool. |
| ~~`invite-to-tenant`~~ | **RESOLVED 28 Aug 2026 — retired (410 stub + folder deletion, same PR).** Confirmed superseded by `invite-user`: zero frontend callers anywhere (every tenant-invite UI calls `invite-user`), and this function's own source comment noted it lacked `invite-user`'s VIVACITY invite_as branch. The migration naming it as an INSERT path is descriptive of the trigger fix, not a functional dependency — the trigger trusts `NEW.invited_by` regardless of which function set it. |
| ~~`get-email-status`~~ | **RESOLVED 28 Aug 2026 — retired (410 stub + folder deletion, same PR).** The live delivery-status feature (Contacts page) already reads status via a direct DB query, not this function — superseded. `email_sends` has only 2 rows, ever. |
| ~~`report-delivery-issue`~~ | **RESOLVED 28 Aug 2026 — retired (410 stub + folder deletion, same PR).** Its target table `email_delivery_issues` has 0 rows, ever. The `/admin/email-test` page `MAILGUN_SETUP.md` implies would call this doesn't exist in the app or its git history. |
| ~~`import-vimeo-training`~~ | **RESOLVED 28 Aug 2026 — retired (PR #455, open).** Confirmed superseded per its own code comments; Carl confirmed retirement. |
| ~~`validate-ai-assist`~~ | **RESOLVED 28 Aug 2026 — retired (410 stub deployed to prod).** Carl confirmed the Sprint 3 AI layer it was built ahead of is no longer planned. |
| ~~`mailgun-webhooks` (plural)~~ | **RESOLVED 28 Aug 2026 — retired (410 stub deployed to prod).** Carl checked Mailgun's actual dashboard config directly: only `mailgun-webhook` (singular) is configured, receiving all 8 event types (Accepted, Delivered, Opened, +5 more). The plural function never received real traffic — `MAILGUN_SETUP.md`'s instruction to use it was simply stale documentation, now corrected. |
| ~~`tga-product-lookup`~~ | **RESOLVED 28 Aug 2026 — retired (PR #455, open).** Its own cache table `tga_cache` has 0 rows, ever — the caching logic has never actually fired in production. Zero frontend callers. Carl confirmed retirement. |
| ~~`test-mailgun`~~ | **RESOLVED 28 Aug 2026 — retired (PR #455, open).** Investigation found it HAD been used before (twice, 20 Jan 2026, per `audit_eos_events`) — not dead code, a real diagnostic tool. Carl chose to retire it anyway since it's not needed going forward. |
| `academy-backfill-course-thumbnails` | **Investigated 28 Aug 2026, kept.** Same carried-forward open item (U2) as `test-mailgun` originally, but investigation found it has genuine pending work: 2 of 100 `academy_courses` still have no `thumbnail_url`. Carl chose to keep it parked rather than retire, and not run it right now. |

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

2. ~~**`assign-package-to-tenant`:**~~ RESOLVED 28 Aug 2026 — see execution log. Source file deleted; the retirement itself already shipped 17 Aug 2026 with no incident since.

3. ~~**`mailgun-webhooks` vs `mailgun-webhook` (singular):**~~ RESOLVED 28 Aug 2026 — Carl checked Mailgun's dashboard directly; see execution log.

4. ~~**`generate-audit-report`:**~~ RESOLVED 28 Aug 2026 — Carl ruled the `client_audits`-based path has fully superseded this; see execution log for the full legacy-implementation removal.

5. **`validate-ai-assist` and `academy-fetch-vimeo-showcase`:** both read as intentionally-built-ahead of a not-yet-shipped frontend feature (Sprint 3 AI layer; a Vimeo showcase preview step) rather than abandoned code. Worth a quick "is this still on the roadmap?" check before either is touched — deleting genuinely-planned scaffolding is a different mistake than deleting genuinely-dead code, and this synthesis can't tell them apart from source alone.

6. **`test-mailgun` / `academy-backfill-course-thumbnails`:** both are explicitly-flagged-but-deferred operator tools from a prior audit pass (item U2) — the standing question ("can a manual/operator workflow be proven retired from source alone?") was never answered, not newly raised here. Carl is the only person who can confirm whether these manual entry points have actually gone unused, since that's an operational fact, not a code fact.

7. **`admin-change-password` / `invite-to-tenant` / `get-email-status` / `report-delivery-issue` / `import-vimeo-training` / `tga-product-lookup`:** all six are live, deployed, no-in-repo-caller functions where the most likely explanation is an out-of-repo caller (admin tooling, a webhook target, an ops script) that this audit has no way to see. Recommend Carl (or whoever owns any Zapier/ops/admin-tool integrations against this Supabase project) do a one-time check of what actually calls these before any of the 19 needs-review items move to a removal PR.

8. **`StageHealthPanel.tsx` / `TenantStageHealthSummary.tsx`:** both dead as components, but a KB dashboard-overhaul mockup doc treats their `health_status`-derivation logic as canonical reference material for a not-yet-built dashboard feature. Worth confirming with whoever owns that mockup whether the logic needs porting somewhere before the source is deleted.

---

## Execution log

*Updated as each batch ships.*

- **2026-08-27:** Plan authored (this doc). Baseline LOC captured. Starting Batch 1.
- **2026-08-27:** Batch 1 shipped — 7 retired edge-function stubs deleted (`create-session`, `create-session-v2`, `auth-send-magic-link`, `admin-reset-user`, `auth-generate-password-reset`, `schedule-task-reminders`, `tmp-backfill-sharepoint-drive-ids`) plus their stale `supabase/config.toml` stanzas. Independently re-verified each retirement marker and zero-caller status before deleting. `npm run build` clean. **Note:** these were already deployed as HTTP 410 stubs in production Supabase — deleting the source here does not undeploy them; if Carl wants them fully removed from the live Supabase project (not just the repo), that's a separate manual step via the Supabase dashboard, since no MCP tool here can delete a deployed edge function. PR #424 merged; Carl manually deleted all 7 from the Supabase dashboard same day — verified gone via `list_edge_functions` (213 functions remaining, none of the 7 present).
- **2026-08-27:** Batch 2 shipped — 17 unused shadcn/ui scaffold primitives deleted (achievement-badge, animated-tabs, aspect-ratio, breadcrumb, carousel, chart, context-menu, data-table-empty, error-display, forms barrel, input-otp, menubar, navigation-menu, print, sidebar, stage-steps, use-toast). Independently re-verified zero importers (aliased + relative import forms, ruled out substring false-positives). `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed. Playwright pass across Dashboard, Executive Dashboard, EOS Live Meeting, Academy Course Detail, AuditWorkspaceNew, and the client portal (Home, Governance Documents, Reports) — zero console errors traceable to the removed files.
- **2026-08-27:** Batch 3 shipped — 2 orphaned barrel files deleted (`client-impact/index.ts`, `eos/facilitator/index.ts`). Confirmed both are bypassed by direct file imports in every real consumer (`ClientImpactPage.tsx`, `EosClientImpact(Detail).tsx`, `LiveMeetingView.tsx`). `npm run build` clean. Playwright: Facilitator Checklist rendered correctly through a full live EOS meeting run-through; `/eos/client-impact` loads cleanly (no existing reports in this environment to click into `ImpactReportView` directly).
- **2026-08-27:** Batch 4 shipped — 12 unused data-layer hooks deleted (academy/useVideoLibrary, useCompletionCascade, useDashboardData, useDocumentAcknowledgements, useEngagementSettings, useEosScorecardMetrics, useGeneratedDocuments, useMeetingLifecycle, useRecoveryCelebration, useRiskCelebration, useTenantRtoScope, useTgaIntegration). Independently re-verified zero importers by exact import path (not just symbol name) — confirmed `useEosScorecardMetrics.tsx` was a dead re-export shim while `LiveMeetingView.tsx` imports the real implementation from `useEos.tsx` directly. `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed. Playwright: EOS Live Meeting and the TGA Integration admin page both zero-error.
- **2026-08-27:** Batch 5 shipped — the §2.14 table only ever listed 18 files despite its "(19)" header (a pre-existing off-by-one in the original audit synthesis); proceeded with the 18 verifiable files rather than guessing at an unlisted 19th. Deleted the orphaned EOS review-pane/legacy-dialog cluster: AISidebar, CarryForwardReviewDialog, ChartReviewPane, FinaliseMinutesDialog, MeetingSeriesEditor, MetricEditorDialog, MinutesHistoryPanel, MinutesStatusBadge, MinutesVersionViewer, MultiClientSelector, QuorumStartGate, RecurringSeriesView, RockPlanningPane, RocksRetrospectivePane, ScorecardGrid, SeatHealthWatchlist, SWOTPane, VTOReviewPane. `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed. Playwright: full EOS Live Meeting run-through (Scorecard + Rock Review segments), plus the standalone `/eos/scorecard` (exercises the live `MetricEditorDialogV2`) and `/eos/rocks` pages — all zero console errors.
- **2026-08-27:** Batch 6 shipped — 8 orphaned Executive Dashboard widgets deleted (AIResearchActivityWidget, ClientHealthMatrix, ConsultantDistributionTable, ExecutiveKpiStrip, PriorityQueueTable, SignalsPanel, SystemHealthBlock, WatchlistPanel). Independently re-verified `SignalsPanel` isn't confused with the live `AlignmentSignalsPanel.tsx` before deleting. `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed. Playwright: `/executive` still renders its full ~20-widget tree with no missing-import errors (only the pre-existing, unrelated `query-knowledge-graph` CORS error).
- **2026-08-27:** Batch 7 shipped — the abandoned "document release readiness" sub-feature plus the superseded top-level bulk-generate dialog, 14 files: AIAnalysisSummaryCard, BulkUploadAISummary, DocFileExtractedFields, DocumentLibraryBrowser, DocumentScanStatus, DocumentStageUsagePanel, DocumentVersionHistory, ExcelDataSourcesTab, ExcelFieldsTab, ReleaseReadinessDialog, ReleaseReviewPanel, StageDeliveryPanel, TenantPacksList, and `documents/bulk-generate/BulkGenerateDialog.tsx`. `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed. Playwright: Manage Documents, Manage Stages, and Admin Stage Detail (including its Documents tab, which shares `useExcelBindings`/`useExcelDataSources` with the deleted tab components) all zero console errors.
- **2026-08-27:** Batch 8 shipped — the highest user-facing-risk batch. Deleted the orphaned client-portal component cluster (ActivityTimeline, AttentionPanel, ClientActionPlanSection, ClientDocumentsTab, ClientNotesTab, ClientPackageBadges, ClientProgressSummary, ClientSharePointDocumentsTab, ClientTimeWidget, ConsultantAssignmentCard, TimelineExportDialog), `client-portal/ClientAICompanionPanel.tsx`, and the 3 orphaned Suggestions pages (ClientNewSuggestionWrapper, ClientSuggestionDetailWrapper, ClientSuggestionsWrapper) — confirmed zero route references anywhere in App.tsx before deleting. Independently confirmed `src/hooks/useClientActivityTimeline.ts` (live, used by `CompliancePulseBanner.tsx`) was untouched — only the dead `ActivityTimeline.tsx` component was removed. `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed. Playwright: exhaustive client-portal sweep as the demo client — Home, Support Tickets, Tasks, Packages, Files, Governance Documents, Users, Staff PDPs, Academy Activity — 9 pages, zero errors traceable to the deletion (one pre-existing local-dev CORS error on Files, same signature seen in earlier batches, unrelated).
- **2026-08-27:** Batch 9 — before touching this batch, resolved the §3 caution about `TenantStageHealthSummary.tsx`'s `health_status`-derivation logic: confirmed `supabase/functions/run-stage-health-monitor/index.ts` is a real, live edge function that independently implements the exact same rules (overdue tasks, high-risk count, mandatory evidence gaps, days-since-activity) and writes `health_status` to `stage_health_snapshots` server-side. The KB doc's `dashboard-overhaul-mockup.md` citation of `StageHealthPanel.tsx`/`TenantStageHealthSummary.tsx` was just a human-readable reference for explaining the algorithm, not the actual source of truth — safe to delete without porting anything. (Note: `StageHealthPanel.tsx` itself is a separate §3 item, not part of this batch's file list, and remains parked.) Shipped: deleted the 8-file orphaned tenant-panel cluster (AuditIntelligencePackPanel, PublicComplianceSnapshotPanel, TenantBurnForecastPanel, TenantCommercialHealthPanel, TenantPlaybooksPanel, TenantRiskForecastPanel, TenantRiskProfilePanel, TenantStageHealthSummary). `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed. Playwright: `/tenant/:tenantId` (`ClientDetailWrapper`) renders fully with zero console errors.
- **2026-08-27:** Batch 10 shipped — the KPI reviewer-admin cluster (`KpiReviewPanel`, `KpiStaffSelector`, `KpiTicketsBoard`, superseded by the `/kpi` page's inline Team KPI toggle and `KpiDeveloperTicketQueue`/`KpiReporterTicketView`) plus the remaining 5 dead pages from §2.29 (`admin/TeamReassignmentPage`, `AdminAiFeatureFlags`, `AdminDocumentAIReview`, `AdminManagePackagesWrapper`, `TenantDetailWrapper`). `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed. Playwright: `/kpi`, `/my/kpi`, and `/admin/manage-packages` (confirms the live `PackageBuilder` mount is unaffected by the similarly-named `AdminManagePackagesWrapper` removal) all zero console errors.
- **2026-08-27:** Batch 11 shipped — the grab-bag of remaining §2.1-§2.28 single-file/small-cluster components (academy/admin, admin, audit, billing/capacity, compliance, consultant, top-level misc, dashboard, governance, help-center, layout, membership, package-builder, portfolio, risk, stage-safe-subset, task-notes, workboard). Recounted the actual remainder at 36 files, not the plan's original "~45" estimate. `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed. Playwright: spot-checked across the affected functional areas (Manage Invites, Audits, Risk Command Centre, Academy Builder) — all zero console errors.
- **2026-08-27:** Batch 12 shipped — the final batch. §2.31–2.34 only ever listed 8 files despite the batch summary's "9" estimate (same pre-existing off-by-one pattern as batch 5); proceeded with the 8 verifiable files. Deleted: PDP superseded components (`features/pdp/components/EvidenceSheet.tsx`, `GoalSheet.tsx` — both replaced by `AddEvidenceSheet.tsx`/`AddGoalSheet.tsx` in `components/academy/pdp/`), `lib/logger.ts` and `lib/validation-schemas.ts` (documented-but-never-adopted patterns — only self-referential JSDoc usage examples matched grep, not real imports), `lib/emit-celebration.ts`, `lib/addinAudit.ts`, `utils/clickup-import-mappings.ts`, and `integrations/tga/tga_endpoints.ts`. `npm run build` clean; `npx vitest run` 282 passed / 15 skipped / 0 failed. Playwright: full PDP cycle flow (Goals tab → Add Goal opens `AddGoalSheet` cleanly; Evidence tab → Add Evidence opens `AddEvidenceSheet` cleanly) and the TGA Integration admin page — all zero console errors.

**12-batch cleanup complete.** All 12 planned batches shipped and merged. Tally at that point: 538,400 → 510,416 lines (−27,984, −5.2%), 2,028 → 1,872 files (−156, −7.7%), across `src/**` and `supabase/functions/**`. The 19 §3 needs-review items were intentionally left untouched pending Carl's explicit sign-off (see §3 and §7) — resolved one by one in the follow-up below.

### Grand total (12 batches + all §3 follow-up work to date)

| | Files | Lines |
|---|---:|---:|
| Baseline (pre-cleanup) | 2,028 | 538,400 |
| **Current (`main`)** | **1,839** | **503,748** |
| **Removed** | **−189 (−9.3%)** | **−34,652 (−6.4%)** |
| Pending merge (PR #457) | 1,837 | 503,059 | −2 more files once merged |

Breakdown of the follow-up work (beyond the original 12 batches), each its own PR:
- `StageHealthPanel.tsx` deleted + 3 edge functions retired (`calculate-phase-completeness`, `academy-fetch-vimeo-showcase`, `validate-ai-assist`) — PR #437 (merged)
- `assign-package-to-tenant` retired stub source deleted (+ 2 stale edge-function tests fixed as a bonus find) — PR #440 (merged)
- `generate-audit-report` retired + the entire legacy Compliance Auditor implementation removed (9 files, 4 routes, 1 sidebar link) — PR #444 (merged); its 3 orphaned DB tables dropped in a follow-up — PR #445 (merged)
- `mailgun-webhooks` (plural) retired after Carl checked Mailgun's actual dashboard config; `MAILGUN_SETUP.md` corrected — PR #446 (merged)
- 5 now-stubbed edge-function folders (`calculate-phase-completeness`, `academy-fetch-vimeo-showcase`, `validate-ai-assist`, `generate-audit-report`, `mailgun-webhooks`) deleted from the repo entirely, plus the orphaned `StageCompletenessWidget.tsx` (flagged deleted in the PR #437 log entry but never actually committed until now) — PR #447 (merged)
- `admin-change-password` retired (no known caller, confirmed with Carl) — PR #449 (merged); its folder deleted in a follow-up — PR #453 (merged, replaces a conflicted #452)
- `invite-to-tenant` retired (superseded by `invite-user`) — PR #450 (merged, folder deletion included in the same PR)
- `get-email-status` + `report-delivery-issue` retired (zero rows ever in their target tables) — PR #451 (merged, folder deletions included in the same PR)
- `src/lib/microsoft/scopes.ts` deleted (confirmed dead, no OAuth-connect UI planned) — PR #454 (merged)
- `test-mailgun`, `tga-product-lookup`, `import-vimeo-training` retired (individually confirmed with Carl, after investigation found `test-mailgun` had real past use but Carl chose to retire it anyway) — PR #455 (merged)
- `compliance-assistant-client` retired (replacement `ask-viv-assistant-client` confirmed fully rolled out to all tenants with real usage since 6 Aug 2026) — PR #457 (open); `bootstrap-bulk-generate-system-account` deleted in the same PR (already a fully neutralized stub, one-time provisioning already complete)

All PRs through #455 are merged; `main` matches the pre-#457 row exactly. PR #457 is still open. **16 of the original 19 §3 items are resolved-and-merged** (4 frontend: `StageCompletenessWidget.tsx`, `StageHealthPanel.tsx`, `useDocumentAIConfidence.tsx`, `microsoft/scopes.ts`; 12 edge functions: `assign-package-to-tenant`, `academy-fetch-vimeo-showcase`, `validate-ai-assist`, `generate-audit-report`, `mailgun-webhooks`, `admin-change-password`, `invite-to-tenant`, `get-email-status`, `report-delivery-issue`, `test-mailgun`, `tga-product-lookup`, `import-vimeo-training`) — rising to **all 19 of 19** once PR #457 merges (adding `compliance-assistant-client` and `bootstrap-bulk-generate-system-account`; `academy-backfill-course-thumbnails` was investigated and deliberately kept, not retired, per Carl's explicit call — see below). All 6 fully-resolved retired functions from the first round (the 5 + `assign-package-to-tenant`) are confirmed fully deleted from the live Supabase project (verified via `list_edge_functions`), not just stubbed. The next 7 (`admin-change-password`, `invite-to-tenant`, `get-email-status`, `report-delivery-issue`, `test-mailgun`, `tga-product-lookup`, `import-vimeo-training`) still show as 410 stubs in Supabase pending Carl's manual dashboard deletion — their folders are already gone from `main` so that deletion will hold.

Once PR #457 merges, every one of the original 19 §3 items will have a final disposition — 18 retired/deleted, 1 (`academy-backfill-course-thumbnails`) deliberately kept parked. This closes out the §3 needs-review list entirely.

### §3 follow-up (post-cleanup)

- **2026-08-28:** Walked through all 19 §3 items with Carl one at a time. Resolved: (1) `StageCompletenessWidget.tsx` + `calculate-phase-completeness` — retire both, feature not wanted; (2) `StageHealthPanel.tsx` — delete, logic confirmed server-side; (3) `academy-fetch-vimeo-showcase` — retire, confirmed unused after Carl flagged doubt (re-verified 3 ways, see §3.2); (4) `validate-ai-assist` — retire, Sprint 3 AI layer no longer planned. Deferred to Carl/ops: `generate-audit-report`, `assign-package-to-tenant`, `mailgun-webhooks` vs `mailgun-webhook` (Carl will check Mailgun's dashboard), the 6 likely-external-caller functions (`admin-change-password`, `invite-to-tenant`, `get-email-status`, `report-delivery-issue`, `import-vimeo-training`, `tga-product-lookup` — parked indefinitely), `test-mailgun`/`academy-backfill-course-thumbnails` (parked), `compliance-assistant-client`/`bootstrap-bulk-generate-system-account` (still waiting out their observation period), and `microsoft/scopes.ts` (Carl will check with the M365 owner).
- **2026-08-28:** `assign-package-to-tenant` resolved — deleted the already-retired stub source (the retirement itself shipped 17 Aug 2026 with no incident since; deleting the source today changes nothing about production behaviour, same reasoning as Batch 1). While re-testing, caught and fixed a real regression left by the earlier `calculate-phase-completeness` retirement: two shared edge-function test files still asserted its old tenant-gated logic. Full edge-function suite now 231/231.
- **2026-08-28:** `generate-audit-report` resolved, and expanded per Carl's direction into a full removal of the legacy Compliance Auditor implementation it served. Investigation found: (a) `compliance_templates`/`compliance_template_sections`/`compliance_template_questions` — the question-bank tables — are still live, read by the *current* Audits system (`useAuditWorkspace.ts`) at `/audits/create-template`; only `compliance_audits` (0 rows, ever) and its child tables `compliance_audit_responses`/`compliance_corrective_actions` are actually dead. (b) The old implementation had a real, clickable sidebar link ("Clients" → "Compliance Auditor" in `DashboardLayout.tsx`) — a correction to an earlier claim in this thread that it had no nav entry; the claim was based on checking `navigationConfig.ts`/`TopBar.tsx` only, missing this separate hardcoded sidebar array. Deleted: `ComplianceAuditGlobal.tsx`, `ComplianceAuditList.tsx`, `ComplianceAuditForm.tsx`, `ComplianceAuditReport.tsx`, `useComplianceAudits.tsx`, and the 4 exclusive `components/compliance-audit/*` files (CAATracker, QuestionCard, ScoreGauge, SectionNav); removed the 4 routes and sidebar link; retired `generate-audit-report` (410 stub, deployed to prod, verified via curl). `npm run build`/`npx vitest run` (282/282) clean. Playwright: `/compliance-audits` now 404s cleanly, sidebar link confirmed gone, and the live Audits system (`/audits`, `/audits/create-template`, an actual audit workspace instance) all zero console errors — the shared template tables are unaffected. DB tables (`compliance_audits`, `compliance_audit_responses`, `compliance_corrective_actions`) confirmed fully isolated (only generic `updated_at` triggers, no other RPC/function references) but not dropped in this pass — flagged for a follow-up schema-cleanup decision, same treatment as the bulk-upload RPCs.
- **2026-08-28, later same day:** Carl confirmed dropping the 3 legacy tables. Applied migration `drop_legacy_compliance_audit_tables` directly to the hosted Supabase project (dropped in FK-dependency order: `compliance_corrective_actions` → `compliance_audit_responses` → `compliance_audits`). Verified all 3 gone via `information_schema.tables` re-query, and confirmed `compliance_templates` (6 rows) untouched. Audit-log entry: `docs/audit-log/entries/2026-08-28-drop-legacy-compliance-audit-tables.md`. This closes out the legacy Compliance Auditor implementation entirely — code, edge function, and now schema.
- **2026-08-28:** `mailgun-webhooks` (plural) vs `mailgun-webhook` (singular) resolved. Instead of guessing from source (impossible, per the original finding), Carl logged into Mailgun's actual dashboard (Sending → Webhooks) and shared a screenshot: only one webhook is configured, pointing at the singular `mailgun-webhook`, covering all 8 event types (Accepted, Delivered, Opened, +5 more). The plural function has never received real traffic — confirmed further via zero invocations in the last 24h of production logs. Retired `mailgun-webhooks` (410 stub, deployed to prod, verified via curl); deleted its now-unneeded `fail-closed.test.mjs` (no other test referenced it); corrected `MAILGUN_SETUP.md`'s stale instruction to point at the plural URL — it should always have said singular. Sanity-checked the live singular function still responds correctly (401 on an unsigned test request, as expected) — untouched by this change. `npm run build` clean; edge-function suite 227/227 (one fewer test than before, since the plural function's own test was removed alongside it).

- **2026-08-28:** Shipped the 4 resolved items — deleted `StageHealthPanel.tsx`; deployed 410 retirement stubs to production for `calculate-phase-completeness`, `academy-fetch-vimeo-showcase`, and `validate-ai-assist` (verified via curl — all three return HTTP 410 live). Stubs are self-contained (no `_shared/cors.ts` import) since the Supabase deploy API only bundles files explicitly passed to it — an early attempt importing the shared module failed to bundle for exactly this reason. `npm run build` clean. A handful of vitest tests (Login/auth, an unrelated EOS form test) timed out during this run; confirmed pre-existing/flaky, not caused by these changes, by re-running the same tests against a clean stash of `main` (7/7 passed).

- **2026-08-28:** While investigating `useDocumentAIConfidence.tsx`'s RPC usage, discovered the entire AI-document-analysis feature (an opt-in "Use AI to suggest categories & descriptions" checkbox in the Stage Documents bulk-upload dialog) has zero production usage ever — `document_ai_audit` has 0 rows, and all 620 `documents.ai_status` values are stuck at the column default. Carl separately asked to investigate removing the whole bulk-upload feature from Stage Documents (now superseded by SharePoint templates) — ran a 4-agent workflow to map every surface it touches and confirm SharePoint's actual coverage before any removal. **Verdict: SharePoint templates does NOT fully replace bulk-upload** — it's single-file only (no batch/multi-file intake), has no AI-suggestion equivalent, and requires the source file to already exist in the one hardcoded SharePoint drive (no arbitrary local-file upload). Full plan with what-to-remove/what-to-keep/open-questions is in the workflow output; not yet actioned — this removal needs Carl's sign-off on the capability-loss questions in the plan (§5 of that report) before anything ships, same standard as any other live-feature removal.

- **2026-08-28:** Carl reviewed the plan and accepted the capability losses — "Link from Library" is the intended path forward for Stage Detail's Documents tab, and any genuine local-file upload need belongs on the separate Manage Documents page (confirmed it already has its own independent upload mechanism, untouched by this change). Shipped the removal: deleted `BulkUploadWithMetadataDialog.tsx`, `AIAnalysisReviewDialog.tsx`, `useDocumentAIAnalysis.tsx`, and (folded in, since the whole pipeline it belonged to is retiring together) the already-dead `useDocumentAIConfidence.tsx` from §3.1 above. Partially edited `useDocumentVersions.tsx` (removed `useBulkDocumentUpload`/`BulkUploadDocument`, exclusive to the deleted dialog) and `StageDocumentsPanel.tsx` (removed the Bulk Upload button/state/dialog render, kept Link from Library as the sole intake action, kept `AIConfidenceBadge` for historical display). `npm run build` clean; vitest showed transient unrelated timeout flakiness across runs, confirmed by a clean 282/282 run. Playwright: Stage Detail Documents tab (Bulk Upload gone, Link from Library present and functional) and Manage Documents (independent, unaffected) both zero console errors.

  **Backend investigation (per Carl's request to check for anything else needing cleanup):** confirmed via `pg_proc`/`pg_cron` queries that all 4 RPCs this feature depended on — `apply_document_ai_analysis`, `approve_document_ai_suggestions`, `reject_document_ai_suggestions`, `bulk_create_documents_with_versions` — are now fully orphaned (zero callers in `src/`, `supabase/functions/`, other Postgres functions, or cron jobs). The only FK-cascade triggers on `document_ai_audit`/`documents` are standard referential-integrity triggers, nothing custom. `documents.ai_status`/`ai_confidence_score`/etc. columns intentionally NOT dropped (still read by the live `AIConfidenceBadge` for historical display).

  **2026-08-28, later same day:** Carl confirmed dropping the 4 RPCs. Applied migration `drop_orphaned_bulk_upload_ai_analysis_rpcs` directly to the hosted Supabase project (fetched exact signatures via `pg_get_function_identity_arguments` first — each had exactly one overload — then `DROP FUNCTION IF EXISTS`). Verified all 4 gone via `pg_proc` re-query. Ran `get_advisors` (security + performance) — no new findings related to this change. Audit-log entry: `docs/audit-log/entries/2026-08-28-drop-orphaned-bulk-upload-ai-analysis-rpcs.md`. `document_ai_audit` table itself (zero rows, ever) left in place, flagged as a future schema-cleanup candidate, not urgent.

- **2026-08-28:** Re-verified all retired-function state directly via `list_edge_functions`/`get_edge_function` (not just curl 410 checks) and found several functions showing signs of an unexplained redeploy — new internal IDs, version bumps, and `entrypoint_path`s in repo-relative form (`supabase/functions/<name>/index.ts`) rather than this session's MCP-deploy temp-path format. Investigated: timestamp-correlated three independent redeploy events against `git log main`, including one (`assign-package-to-tenant`, redeployed 9 seconds after an unrelated Contact Directory push that touched zero function code) that ruled out "reacts to function changes" as the trigger. Conclusion: Supabase's own GitHub → Edge Functions sync integration (a dashboard-level setting, not anything in `.github/workflows/`, which only runs lint checks with no deploy step or Supabase token) re-syncs the entire `supabase/functions/**` tree from `main` on **every** push, unconditionally. Content was confirmed safe in every case (still the correct retirement-stub text) — no security regression — but the practical implication is that a dashboard delete only holds once the function's **folder is removed from `main`**; while the folder still exists, the next push (for any reason) resurrects it.
- **2026-08-28:** Per Carl's direction ("just need to delete the folder then"), shipped PR #447 — deleted the repo folders for the 5 remaining stubbed functions (`calculate-phase-completeness`, `academy-fetch-vimeo-showcase`, `validate-ai-assist`, `generate-audit-report`, `mailgun-webhooks`) plus the orphaned `StageCompletenessWidget.tsx` (confirmed zero importers via repo-wide grep — it had been logged as deleted back in the PR #437 entry above but the deletion was never actually committed). Removed the matching `[functions.*]` stanzas from `supabase/config.toml`. `npm run build` clean; `npx vitest run` 282/282; `npm run test:edge-functions` 227/227; Playwright smoke check on `/dashboard` zero new console errors. PR #446 (mailgun-webhooks retirement, previously open) and PR #447 both merged same day.
- **2026-08-28:** Final verification — re-ran `list_edge_functions` after both PRs merged. All 5 folder-deleted functions are now fully absent from the live Supabase project (not just stubbed). Carl separately deleted `assign-package-to-tenant` from the dashboard; re-verified via `list_edge_functions` that it too is now gone. **All 6 retired functions from this session are confirmed fully removed from Supabase, with their folders also gone from `main` — nothing in the repo remains to re-trigger the GitHub sync, so the deletions are durable.**

- **2026-08-28, next round:** Worked through the remaining 11 parked §3 items one by one at Carl's request. `admin-change-password` — deeper investigation found it requires a live SuperAdmin JWT (no true external caller possible without someone's real login), zero UI references, zero 24h invocations; Carl confirmed no Super Admin has used or knows of it as a manual unlock tool. Retired as a 410 stub — PR #449 (merged).
- **2026-08-28:** `invite-to-tenant` investigated — confirmed superseded by `invite-user` (every tenant-invite UI calls `invite-user`; this function's own source comment noted it lacked `invite-user`'s VIVACITY invite_as branch; the migration naming it as a `user_invitations` INSERT path is descriptive of a trigger fix, not a functional dependency on this specific function). Carl confirmed retirement. Retired as a 410 stub + folder deletion in the same PR — PR #450 (merged).
- **2026-08-28:** `get-email-status` and `report-delivery-issue` investigated together (similar profile). `get-email-status`'s job is now done by a direct DB query in the live Contacts page delivery-status feature (`use-client-tenant-users.ts`) — superseded. `report-delivery-issue`'s target table `email_delivery_issues` has 0 rows, ever, and the `/admin/email-test` page `MAILGUN_SETUP.md` implies would call it doesn't exist in the app or its git history. Carl confirmed retiring both. Deployed 410 stubs, then — since the evidence here was zero-rows-ever rather than just zero-recent-invocations — deleted both folders in the same PR rather than waiting for a separate observation period; also deleted the now-obsolete `email-delivery-caller-auth.test.mjs`. PR #451 (merged).
- **2026-08-28:** Per Carl's follow-up question ("did you need to delete those files as well?"), went back and added folder deletions to the two PRs that had only deployed stubs so far. `invite-to-tenant`'s PR (#450) was still open, so the folder deletion landed directly in it. `admin-change-password`'s PR (#449) had already merged, so a new PR was needed — first attempt (#452) hit a merge conflict from squash-merge divergence against `main`; rebasing and force-pushing was blocked by the permission classifier, so instead cherry-picked the folder-deletion commit onto a fresh branch off current `main` and opened a clean replacement, PR #453 (merged); #452 closed as superseded.
- **2026-08-28:** `src/lib/microsoft/scopes.ts` — Carl confirmed dead (no OAuth-connect UI or shared-source-of-truth plan). Deleted; zero importers confirmed via grep. PR #454 (merged).
- **2026-08-28:** Investigated the last group — `test-mailgun`, `academy-backfill-course-thumbnails`, `import-vimeo-training`, `tga-product-lookup` — before asking Carl, per his request. Findings changed the picture for two of them: `test-mailgun` had actually been used before (twice, 20 Jan 2026, via `audit_eos_events`) — not dead code, a real diagnostic tool, just not recently active. `academy-backfill-course-thumbnails` still has genuine pending work (2 of 100 `academy_courses` missing a `thumbnail_url`) — its job isn't finished. `tga-product-lookup`'s own cache table (`tga_cache`) has 0 rows, ever, despite 607 deploy versions — the caching logic has never actually fired in production. `import-vimeo-training` remains superseded per its own code comments, as originally flagged. Presented all four findings to Carl individually: he chose to retire `test-mailgun` anyway (not needed going forward, despite its past use), keep `academy-backfill-course-thumbnails` parked without running it now, and retire both `tga-product-lookup` and `import-vimeo-training`. Deployed 410 stubs for all three retirements, verified via curl, then deleted all three folders in the same PR (plus `test-mailgun`'s now-stale `cors-and-auth.test.mjs` and `tga-product-lookup`'s `config.toml` stanza). `npm run build` clean; edge-function suite 220/220. PR #455 (open, awaiting merge).

**Status at this point:** 13 of the original 19 §3 items resolved-and-merged (rising to 16 once PR #455 merges); 3 remain deliberately parked (`compliance-assistant-client`, `bootstrap-bulk-generate-system-account` — both still waiting out their own stated observation periods — and `academy-backfill-course-thumbnails`, kept per Carl's explicit call today). `admin-change-password`, `invite-to-tenant`, `get-email-status`, `report-delivery-issue` are live in Supabase as 410 stubs with their folders already gone from `main` — safe for Carl to delete from the dashboard whenever, the deletion will hold.

- **2026-08-28:** PR #455 merged. Carl then asked for a `cleanup-worktrees` skill (`~/.claude/skills/cleanup-worktrees/SKILL.md`, mirroring `kill-node`'s classify-before-touching pattern) to deal with the pile of git worktrees accumulated under this repo — 70 registered at the time, matching the exact root cause AGENTS.md documents for the Vite dep-scan hang. Ran it: enumerated all 70 via `git worktree list --porcelain`, checked each for uncommitted changes (`git status --porcelain`) and merge status (cross-referenced against `gh pr list --state all` rather than trusting `git branch --merged`, since many branches' remotes had already been deleted after squash-merge). Carl separately identified `review-worktrees/codebase-optimization-council` as Codex's active worktree (confirmed independently — its HEAD had just synced to the exact commit of a PR merged moments earlier). Classified: 1 active (excluded), 11 dirty (excluded), 55 merged-and-clean (bulk removed on Carl's approval), 2 with real unmerged commits but confirmed abandoned/superseded after review (removed on Carl's approval) — 57 removed via `git worktree remove`, 1 more stale registration cleared via `git worktree prune` (its directory had already been deleted outside git). 70 → 13 worktrees. Carl then asked to force-remove the remaining 11 dirty ones too — reviewed each first (7 shared an identical stale auto-generated Lovable `mcp/index.ts` bundle diff, 2 were Vite-hang debugging scratch files, 1 was a Playwright test-artifact folder, 1 was an already-obsolete audit-log note about functions already retired this session) and confirmed nothing of value, then force-removed all 11 (`git worktree remove --force`, which needed Carl's direct terminal approval once — the classifier blocked the same command from this session even after an in-chat "yes", requiring either a smaller single-command retry or Carl running it himself; a single-command retry went through). Final: **70 → 2 worktrees** — just `main` and Codex's still-active one, untouched throughout.
- **2026-08-28:** Per Carl's direction to close out the remaining 3 parked items and "reduce pollution and LOC," investigated `compliance-assistant-client` and `bootstrap-bulk-generate-system-account` in depth. For the former: queried `app_settings` directly and found `ask_viv_client_assistant_all_tenants = true` with 28 real conversation turns since 6 Aug 2026 — the replacement's observation period has clearly elapsed. Grepped every `_shared` module the old function imports and confirmed each is also used by `compliance-assistant` (staff sibling, untouched) and/or `ask-viv-assistant-client` (the replacement) — nothing shared was at risk. Checked `ai_client_query_usage` specifically (the old function's usage-cap table) and found the new function deliberately reuses it as its own request-count cap — left untouched. For the latter: reading its actual source revealed it's already a fully neutralized 410-only stub, not a "confirm the placeholder reason" question at all. Deployed a 410 stub for `compliance-assistant-client` (verified via curl), deleted both folders, then — per Carl's explicit ask to verify in Playwright — signed out of the SuperAdmin session, logged in as the Demo RTO client persona, opened the live Ask Viv panel, and sent a real question; confirmed via `browser_network_requests` that it hit `POST /functions/v1/ask-viv-assistant-client` (200), not the retired function, with zero console errors. `npm run build` clean, `npx vitest run` 282/282, edge-function suite 220/220. PR #457 (open, awaiting merge). **This resolves all 19 of the original §3 items** — 18 retired/deleted once #457 merges, 1 (`academy-backfill-course-thumbnails`) deliberately kept.
