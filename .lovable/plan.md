

## Plan — Audit finding codes + derived risk rating in the UI

Pure additive UI work. Schema, trigger, view, and backfill are already live. The DB owns `finding_code` (auto-generated on INSERT) and `risk_rating` (auto-derived from finding priorities). The UI must stop writing those fields and start displaying them properly.

### 1. Type updates (`src/types/auditWorkspace.ts` + `src/types/clientAudits.ts`)

- Add `finding_code: string | null` and `regulatory_reference: string | null` to `AuditFinding`.
- Add `code_prefix: string | null` to `AuditSection`.
- Extend `AuditRisk` to include `'extreme'` and add a label.

### 2. Finding create/edit form (`AddFindingForm.tsx`)

- **Create mode**: remove the "Standard Reference" input. Show a small read-only banner "Finding code: will be auto-generated on save". Do NOT include `finding_code` or `standard_reference` in the payload sent up.
- **Edit mode**: show the existing `finding_code` as a bold monospace pill at the top (e.g. `GOV-2`). Show legacy `standard_reference` only if non-null, labelled "Legacy reference (read-only)".
- Add a new **Regulatory Reference** input bound to `regulatory_reference`, with helper text *"SRTO 2025 clause, National Code 2018 Standard, or ESOS section. e.g. Std 1.1, NC 7.2, ESOS s.22"*.
- Keep existing fields: summary, detail, impact, priority.

### 3. Finding card / list (`FindingsTab.tsx`)

- Replace the current header row with: monospace bold `{finding_code}` pill → priority badge (colour-coded per spec: critical red, high orange, medium yellow, low grey) → summary → muted `regulatory_reference` → created date.
- Add a new top-bar text filter that filters by `finding_code` substring (in addition to existing priority/AI/manual chips).
- Sort within each priority group by `finding_code` ascending.

### 4. `useAuditFindings` mutation guard (`src/hooks/useAuditWorkspace.ts`)

- In `createFinding`, strip `finding_code` and `standard_reference` from the payload before INSERT — let the trigger generate the code.
- After the INSERT succeeds, invalidate `audit-findings` (already happens) so the new row with the DB-assigned code renders immediately.
- In `updateFinding`, allow `regulatory_reference` through; existing fields unchanged.

### 5. Stop the UI from writing `risk_rating` (`OverviewTab.tsx`)

- Replace the editable "Overall Risk Rating" Select with a read-only `AuditRiskBadge` plus a one-line explainer: *"Auto-derived from finding priorities. Add or update findings to change this."*
- Remove the "Score" 2xl number from this card (it's confusing next to a derived risk rating).

### 6. Audit summary header — two-pill bar (`AuditWorkspaceNew.tsx`)

Insert a new strip immediately under the breadcrumb, above the Tabs:

```text
┌──────────────────────────────┐  ┌──────────────────────────┐
│ COMPLETION                   │  │ RISK RATING              │
│ 14 of 31 answered (45%)      │  │ EXTREME  ⚠               │
└──────────────────────────────┘  └──────────────────────────┘
```

- **Completion pill** — slate background. Counts answered vs. total document-review questions (reuse the same calc the sidebar uses; lift it to a small `useAuditCompletion(auditId)` hook so header + sidebar share one source of truth).
- **Risk Rating pill** — uses `audit.risk_rating`. Colour map: low=green, medium=yellow, high=orange, critical=red, extreme=maroon (`bg-red-900 text-red-50`) with `AlertTriangle` icon. NULL → slate "Not yet rated (no findings raised)".
- Tooltip on the Risk Rating pill explains the rubric (Extreme: 3+ Critical OR 2+ Critical with 2+ High; Critical: 2 Critical; High: 1 Critical or any High; Medium: any Medium; Low: only Low).
- The footer block in `AuditSidebar.tsx` keeps its small `AuditRiskBadge` but loses the "Score: X%" line (moved out of risk context). Score % can still appear inside `DocumentReviewPhase` per-section which is purely a question-progress meter.

### 7. Open Action Items warning banner (`ActionsTab.tsx`)

- Add a query `useFindingsWithoutActions(auditId)` against `v_client_audit_findings_without_actions` (filtered by `audit_id`, ordered by priority then `finding_code`).
- If it returns rows, render an amber warning banner above the existing filter bar:

  > ⚠ {count} finding(s) at Critical or High priority have no action items assigned. Every Critical and High finding should have at least one action item before the report is released.
  > [ Review findings → ] [ Generate suggested actions → ]

- "Review findings" jumps to the Findings tab.
- "Generate suggested actions" opens `ActionDrawer` pre-filled per spec for the **first** unaddressed finding (then closes & reopens for the next when saved). Pre-fill values: `action_type='corrective_action'`, `priority=finding.priority`, `title="Address: " + finding.summary` (truncated to 120 chars), `due_date=today+30d`, `evidence_required=true`, `delivery_model='client_self'`, `finding_id=finding.id`, `standard_reference=finding.finding_code`.

### 8. Document Review phase — section prefix pill (`DocumentReviewPhase.tsx`)

- Inside `DocumentReviewSection`, render a small monospace pill (e.g. `GOV`) next to `section.title` when `section.code_prefix` is non-null. Read-only.
- No structural changes elsewhere in the three-phase header.

### 9. Report preview (`ReportTab.tsx`)

- Risk Rating row: keep using `AuditRiskBadge` — it now needs to support `extreme` (extend `AuditRiskBadge.tsx` colour map and `AUDIT_RISK_LABELS`).
- Findings list section: change each heading from `{standard_reference} — {summary}` to `{finding_code} — {summary.slice(0,80)}`. If `regulatory_reference` is set, render a sub-line *"Regulatory: {regulatory_reference}"*.
- Below the findings list, query `v_client_audit_findings_without_actions` for this audit; if rows exist, append: *"Note: {count} Critical/High findings above do not yet have corrective actions assigned. Action items will be added before the final report is released."*

### 10. Client-facing reports (`ClientAuditReportsSection.tsx`) and risk badge

- `AuditRiskBadge.tsx`: add `extreme` to the colour map (`bg-red-900 text-red-50 border-red-950`) and add label "Extreme" to `AUDIT_RISK_LABELS`. Update `AuditRisk` union type in `src/types/clientAudits.ts`.

### What this plan does NOT touch

- No DB migrations, no edge functions, no changes to the audit module embedded in stage instances.
- `useAuditScore` keeps writing `score_pct` for analytics/section meters — only its visual placement next to risk rating is removed.
- The Preliminary Summary email (`buildPreliminaryAuditSummary.ts`) is **not** changed in this plan; risk rating already reads from `audit.risk_rating`. Adding `finding_code` to the email body can be a follow-up if needed.

### Verification (matches the acceptance checklist)

1. Open Smart Education DD audit (`3b1fbbee-...`). Header pills now show `14 of 31 answered (45%)` and `EXTREME` (red/maroon, with tooltip rubric).
2. Findings tab lists `SCOPE-1 / GOV-1 / GOV-2 / FIN-1 / FIN-2 / TAQ-1 / TAQ-2` — bold monospace pills, no duplicates, sorted within priority.
3. Click "Add Finding" → no Standard Reference text field; "Regulatory Reference" field present; banner says code will be auto-generated. Save → new card appears immediately with its DB-assigned code (e.g. `GOV-3`).
4. Edit an existing finding → finding_code shown as read-only pill at top; legacy `standard_reference` shown only if present.
5. Actions tab shows the amber warning banner ("5 Critical/High findings have no action items"); "Generate suggested actions" pre-fills the drawer correctly.
6. Document Review phase shows `GOV` / `TAQ` / `FIN` pills next to section titles.
7. Overview tab no longer lets the user edit risk rating — it's a read-only badge with explainer.
8. Network panel: `INSERT` to `client_audit_findings` payload contains no `finding_code` and no `standard_reference`; `UPDATE` to `client_audits` never includes `risk_rating`.
9. Report preview shows finding headings as `{finding_code} — {summary}` with `Regulatory: {regulatory_reference}` sub-line when present.

