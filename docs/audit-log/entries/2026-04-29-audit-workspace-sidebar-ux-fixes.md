# Audit: 2026-04-29 — Audit workspace sidebar UX fixes

**Author:** Khian (Brian)  
**Trigger:** ad-hoc — two UX bugs identified in the audit workspace sidebar  
**Scope:** `AuditWorkspaceNew.tsx`, `AuditSidebar.tsx`, `DocumentReviewPhase.tsx` — frontend only  
**Codebase verified at:** `unicorn-cms-f09c59e5@732d788f` (pre-fix state read in full before prompting Lovable)

---

## Context

Two UX bugs were identified in the audit workspace sidebar. All three affected files were read in full before any prompting. Both root causes were confirmed from source before fixes were written.

---

## Finding 1 — `isSelected` was a dead prop; sidebar section click did not scroll

**File:** `src/components/audit/workspace/DocumentReviewPhase.tsx`

`DocumentReviewSection` accepted `isSelected: boolean` in its props interface but never used it — the prop was destructured and discarded. The card element had `id={`section-${section.id}`}` which serves as a valid scroll anchor, but nothing called `scrollIntoView` on it. Clicking a section in the sidebar called `onSelectSection` (which updated `selectedSection` state and switched the tab to `form`) but the page did not scroll the selected section card into view.

**Root cause:** `isSelected` was wired up at the `DocumentReviewPhase` level (`isSelected={section.id === selectedSectionId}`) but the scroll behaviour was never implemented inside `DocumentReviewSection`.

**Fix:** Added `useEffect` inside `DocumentReviewSection` that fires when `isSelected` becomes `true`:

```ts
useEffect(() => {
  if (isSelected) {
    document.getElementById(`section-${section.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}, [isSelected]);
```

`useEffect` added to the React import at line 1. No other logic changed.

---

## Finding 2 — Sidebar highlighted section 0 on all tabs, not just Audit Form

**Files:** `src/pages/AuditWorkspaceNew.tsx`, `src/components/audit/workspace/AuditSidebar.tsx`

`selectedSection` was initialised as `useState(0)` in `AuditWorkspaceNew`. `AuditSidebar` highlighted whichever section matched `selectedSectionIndex` unconditionally — with no awareness of which tab was active. On page load (Overview tab), index 0 (whichever section is first) appeared permanently highlighted in the sidebar even though the Audit Form tab was not open and no section had been deliberately selected.

**Root cause:** `activeTab` state existed in `AuditWorkspaceNew` (line 58) but was never passed to `AuditSidebar`. The highlight condition in `AuditSidebar` was:

```ts
section.originalIndex === selectedSectionIndex
```

with no tab guard.

**Fix:**

1. `AuditSidebarProps` extended with `activeTab?: string`.
2. `AuditSidebar` destructures `activeTab`.
3. Highlight condition changed to:

```ts
section.originalIndex === selectedSectionIndex && activeTab === 'form'
```

4. `AuditWorkspaceNew` passes `activeTab={activeTab}` to `AuditSidebar`.

Sidebar now only highlights a section when the Audit Form tab is active.

---

## Fix summary

| File | Change |
|------|--------|
| `src/components/audit/workspace/DocumentReviewPhase.tsx` | Added `useEffect` + `scrollIntoView` to `DocumentReviewSection`; added `useEffect` to React import |
| `src/components/audit/workspace/AuditSidebar.tsx` | Added `activeTab?: string` to `AuditSidebarProps`; updated highlight condition |
| `src/pages/AuditWorkspaceNew.tsx` | Passes `activeTab={activeTab}` to `AuditSidebar` |

Scope: frontend only. No DB tables, no migrations, no RLS policies, no edge functions changed.

---

## Verification

Both bugs smoke-tested manually after Lovable shipped. Sidebar section click confirmed scrolling. Sidebar confirmed showing no highlight on Overview, Schedule, Documents, Findings, Actions, and Report tabs; correct section highlighted on Audit Form tab.

---

## KB changes shipped

None this session.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5@732d788f` — pre-fix state read in full for `AuditWorkspaceNew.tsx`, `AuditSidebar.tsx`, and `DocumentReviewPhase.tsx` before prompting Lovable. Root causes confirmed from source before any fix was written.

---

## Decisions

None drafted or resolved this session.

---

## Open questions parked

- `isSelected` is now active (drives scroll). If a codebase-state refresh is done on the Audits module, note that this prop was previously dead and is now load-bearing — any module state doc describing `DocumentReviewPhase` props should reflect this.
- Old `AuditWorkspace` page (`src/pages/AuditWorkspace.tsx`) is imported in `App.tsx` (line 90) but has no active route — `/audits/:id` routes exclusively to `AuditWorkspaceNew`. Candidate for removal in a cleanup pass.

---

## Tag

`audit-2026-04-29-audit-workspace-sidebar-ux-fixes`
