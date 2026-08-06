# Audit: 2026-08-05 — Audit workspace section duplication (data repair + fix)

**Trigger:** ad-hoc — surfaced mid-session during dark mode QA of the Audit workspace (Overview/Audit Form tabs), when Carl spotted visibly duplicated sections ("Opening Meeting" repeated 4x, "Outcome 1 — Training" repeated 3x+) in a screenshot and asked for it to be investigated.
**Scope:** Repaired one live, real client audit's corrupted section data; shipped a code fix to prevent recurrence. No KB changes. Dark-mode styling fixes from the same session are tracked separately (PR #157) and not detailed here.

## Findings

- Root cause: `useInitializeSections` (`src/hooks/useAuditWorkspace.ts`, invoked by `AuditFormTab.tsx` to seed a new audit's sections from its template) had no server-side idempotency check. The only guard was a local React `initialized` `useState` flag in `AuditFormTab.tsx`, which resets on every fresh mount of the component. If the sections query ever reported empty at the wrong moment on a later page load (cold cache, transient network blip, or similar), the mutation would blindly insert a full duplicate set of template sections on top of whatever already existed — with no check at all.
- Confirmed via SQL this wasn't a hypothetical: it hit one live, in-progress audit for real RTO client AMR (`client_audit_sections.audit_id = '4a5fc12d-ccf3-461a-9b85-5ab8c28f7204'`), on 4 separate days (14 Jul, 29 Jul, 3 Aug, 4 Aug 2026) — 19 template sections became 76 rows (exactly 4x every section, confirming a clean full-batch re-seed each time rather than partial corruption).
- Checked scope across all audits before doing anything: confirmed this was isolated to the single AMR audit — no other audit in `client_audit_sections` showed the same pattern.
- Real auditor work existed and was split across two different duplicate rows for 3 of the 19 sections (Opening Meeting; Outcome 1 — Training; Outcome 1 — RPL & Credit Transfer): 9 `client_audit_responses` rows sat on "duplicate" (later-created) section rows, only 2 on the originals. Checked question-by-question across every affected section — no question was ever answered twice across duplicates, so there was no conflicting-answer decision to make, only a re-pointing exercise. 0 findings existed on any duplicate row.
- Remediation performed directly via SQL, with Carl's explicit approval before running anything (this is real, sensitive client compliance-audit content, not test data):
  1. For each `template_section_id`, designated the earliest-created row as canonical.
  2. `UPDATE client_audit_responses SET section_id = <canonical>` for the 9 responses sitting on non-canonical duplicates — verified via `RETURNING` that all 9 moved as expected.
  3. Verified total response count for the audit unchanged at 11 (2 original + 9 re-pointed) before deleting anything.
  4. Deleted the 57 now-empty duplicate section rows (`RETURNING` confirmed exactly the expected 57 ids/titles).
  5. Final verification: 19 sections, 11 responses, 0 orphaned responses (no response referencing a since-deleted section).
- Fix shipped separately (PR #156): re-check `client_audit_sections` for existing rows scoped to `audit_id` inside the mutation itself before inserting anything, no-op if any are found. This is authoritative regardless of how many times or from where the effect fires — closes the actual hole rather than patching the client-side symptom. The local `initialized` flag was left in place as a harmless fast-path.
- Did not root-cause *why* the sections query reported empty on 4 separate occasions weeks apart (vs. e.g. a same-session double-fire, which would cluster within seconds/milliseconds, not days) — parked as an open question below.

## KB changes shipped

- No changes.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` — fix shipped as PR #156 (`hotfix/audit-workspace-idempotency`, stacked on #155), not yet merged at time of writing. Dark-mode styling fixes from the same session are PR #157 (`hotfix/audit-workspace-dark-mode`, stacked on #156), also not yet merged.
- Data remediation was applied directly to prod Supabase (project `yxkgdalkbrriasiyyrwk`) via the Supabase MCP tool (`execute_sql`), ahead of the code fix PR, with Carl's explicit approval given per-step before the UPDATE and again before the DELETE.

## Decisions

- No ADRs drafted or resolved this session.

## Open questions parked

- **Why did the sections query report empty 4 times, weeks apart, for this one audit specifically?** The fix closes the hole regardless of cause, but the actual trigger (auth race on a slow connection? a specific navigation path? something about this audit's tenant/session?) wasn't identified. Worth watching for recurrence of the *symptom* (any audit showing duplicate sections again) even with the guard in place, since that would indicate the same underlying trigger is still firing, just now harmlessly.
- **No DB-level uniqueness constraint exists on `(audit_id, template_section_id)`.** The application-layer re-check in PR #156 closes the practical hole for this code path, but doesn't prevent duplication via some other future insert path. A partial unique index would be defense-in-depth; not done here as it's a schema change and out of scope for a same-session hotfix — flagging for a future migration if this class of bug recurs elsewhere.

## Tag

audit-2026-08-05-audit-workspace-section-duplication-fix
