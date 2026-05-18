# Plan: Gate Scores on AuditProgressCard

## Scope
Single file: `src/components/client/AuditProgressCard.tsx`. UI-only. No DB or API changes.

## Background
The `client_audits` RLS was relaxed to let clients see active audits (`status IN ('draft', 'in_progress', 'review')`). Partial `score_pct`, `score_total`, `score_max`, and `risk_rating` values are populated progressively during the audit — rendering them mid-flight would mislead clients before sign-off. This change gates the display so scores/risk only appear once the audit is complete.

## Changes

### 1. Hide score and risk when status !== 'complete'
- In the header row (line 52-55): conditionally render `<AuditRiskBadge>` only when `status === 'complete'`.
- In the score block (line 60-68): replace the `maxScore > 0` block with a conditional:
  - If `status === 'complete'`: render the existing score number, progress bar, and threshold color.
  - If `status IN ('draft', 'in_progress', 'review')`: render a calm placeholder — e.g. a muted line reading "Pending — audit in progress".
- Keep the schedule rows (document_deadline_at, opening_meeting_at, closing_meeting_at) exactly as-is.
- Keep the "Open Audit Workspace" deep-link button.

### 2. Minimal implementation details
- Add a boolean: `const isComplete = status === 'complete';`.
- Risk badge: `{isComplete && audit.risk_rating && <AuditRiskBadge ... />}`.
- Score block:
  ```tsx
  {isComplete ? (
    <div className="space-y-1"> ...existing score + progress... </div>
  ) : (
    <div className="text-xs text-muted-foreground">
      Pending — audit in progress
    </div>
  )}
  ```
- Remove the `maxScore > 0` guard (it is subsumed by the `isComplete` check; the query still fetches the columns).
- Keep the underlying query whitelist unchanged.

## Verification
- tsc --noEmit passes.
- Browser smoke test: TP `diamondhood14@gmail.com` → `/client/home` → Mock Audit card shows the placeholder, not a score bar or risk badge.
- (If available) A completed-and-released audit card still shows score + risk as today.

## Out of scope
- DB / migrations
- Other components (`ClientAuditReportsSection`, `ClientUpcomingAuditSection`, `useReleasedAudits`)
- Query/hook layer
- Styling changes outside the score/risk display area

## Risk assessment
Negligible. UI-only conditional render. No data model or API changes. Revert by removing the `isComplete` conditional.