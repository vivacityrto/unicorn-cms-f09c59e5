

## Plan: Edit findings + richer Preliminary Summary detail

### Part A — Edit existing findings (as previously approved)

**1. `src/hooks/useAuditWorkspace.ts`**
- Add `updateFinding` mutation to `useAuditFindings` that updates `client_audit_findings` by id with `summary`, `detail`, `standard_reference`, `impact`, `priority`, then refreshes the cache.

**2. `src/components/audit/workspace/AddFindingForm.tsx`**
- Accept optional `initialValues` and `mode: 'create' | 'edit'` props.
- In edit mode, prefill all fields and change save button to **"Update Finding"**. Same `onSave` shape — parent decides create vs update.

**3. `src/components/audit/workspace/FindingsTab.tsx`**
- Add a pencil **Edit** button next to the existing Delete on each finding card.
- Track `editingId`. When set, render `AddFindingForm` inline in place of that card, prefilled with current values.
- On save → `updateFinding.mutate({ id, ...fields })` → clear `editingId`. Cancel → revert.
- `is_auto_generated` flag preserved on edit.

### Part B — More detail in the Preliminary Summary email

Edit `src/lib/buildPreliminaryAuditSummary.ts` to enrich the body. The existing structure (banner → header → coverage → findings → actions → notes) stays; we add depth within each block.

**Findings section — show full context, not just a one-liner**
For each finding, render:
- Summary (current behaviour)
- **Standard reference** (e.g. *"Standard 1.3(b)"*) as a small grey tag next to the priority pill
- **Detail** paragraph (if present) below the summary
- **Impact** line prefixed *"Impact:"* (if present)
- AI-draft tag preserved

**Coverage section — add per-section breakdown**
Below the existing overall completion percentage, add a compact table:
| Section | Answered / Total | % |
This makes it obvious which areas of the audit are still open.

Data: derive in `SendPreliminarySummaryDialog.tsx` from the same query that already powers the overall percentage — group counts by `client_audit_sections.id`/`title` and pass as a `sectionCoverage` array to the builder.

**Action items section — add owner + finding link**
Extend each row of the open-actions table with:
- **Owner** column (`assigned_to_name` if available, else "Unassigned")
- Link the action back to its source finding by appending *"— linked to: {finding summary, truncated 60 chars}"* on a second line when `finding_id` is set

**Risk + score block — add narrative line**
When `risk_rating` is set, append the rating's label and (if `score_pct` set) a one-liner: *"Indicative score X% — Y of Z questions rated, Q findings raised (C critical, H high)."*

**New "Outstanding evidence" mini-section**
Below Coverage, if there are any responses with `rating = 'partial'` or `rating = 'non_compliant'` that don't yet have evidence files attached, list up to 5 with their question text and section. This directly answers "what are we still waiting on?". Source: existing `client_audit_responses` query in the dialog (no new fetch — just a filter pass).

### What stays the same
- Email-only, no persistence, creator CC'd and locked.
- Disclaimer banner unchanged at the top.
- Hidden once final report is released.
- Send path (Outlook Graph or Mailgun) unchanged.

### Verification
1. Findings tab → pencil icon edits a finding inline; "evidence.ining" can now be corrected.
2. Open Send Preliminary Summary → email body now shows: per-section completion table, outstanding evidence list, findings with detail + impact + standard ref, actions with owner + linked finding, and a narrative risk/score line.
3. Send → email arrives with all extra detail; creator CC'd; no DB rows written.
4. Released audit → button still hidden.

