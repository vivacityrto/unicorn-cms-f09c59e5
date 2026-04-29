# Fix audit workspace sidebar UX bugs

## Bug 1 — Section card scroll on selection
**File:** `src/components/audit/workspace/DocumentReviewPhase.tsx`
- Line 1: change `import { useState } from 'react'` → `import { useEffect, useState } from 'react'`.
- Inside `DocumentReviewSection`, after `const [open, setOpen] = useState(true);` (line 179), add:
  ```ts
  useEffect(() => {
    if (!isSelected) return;
    const el = document.getElementById(`section-${section.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isSelected, section.id]);
  ```

## Bug 2 — Sidebar should not highlight section when not on Audit Form tab
**File:** `src/pages/AuditWorkspaceNew.tsx` (line 127)
- Add `activeTab={activeTab}` prop to `<AuditSidebar>` after `leadAuditorAvatar`.

**File:** `src/components/audit/workspace/AuditSidebar.tsx`
- In `AuditSidebarProps` (line 19–30), add `activeTab?: string;`.
- In destructuring (line 38–49), add `activeTab,`.
- Line 239: change highlight condition to `section.originalIndex === selectedSectionIndex && activeTab === 'form'`.

## Out of scope
No DB / RLS / edge function changes. No edits to other tabs, page scroll behaviour, or the legacy `AuditWorkspace.tsx`.
