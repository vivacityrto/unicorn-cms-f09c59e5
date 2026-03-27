

## Fix: Document Navigation 404 + Show Name & Description in Stage Documents

### Problem
1. Clicking a document in Manage Stages navigates to `/admin/documents/{id}` — a route that doesn't exist — causing a 404
2. Stage Documents list only shows the document `title` but not the `description`, making it hard to correlate with the Manage Documents list

### Changes

**1. Fix 404 navigation — 3 files**

| File | Line | Current | New |
|------|------|---------|-----|
| `StageDocumentsPanel.tsx` | 321 | `window.open('/admin/documents/${docId}', '_blank')` | `window.open('/admin/manage-documents?doc=${docId}', '_blank')` |
| `StageDocumentsPanel.tsx` | 327 | `window.open('/admin/documents/${selectedDocForEdit.id}', '_blank')` | `window.open('/admin/manage-documents?doc=${selectedDocForEdit.id}', '_blank')` |
| `DocumentLibraryBrowser.tsx` | 293 | `navigate('/admin/documents/${doc.id}')` | `navigate('/admin/manage-documents?doc=${doc.id}')` |
| `AdminDocumentAIReview.tsx` | 531 | `window.open('/admin/documents/${detailDoc.id}', '_blank')` | `window.open('/admin/manage-documents?doc=${detailDoc.id}', '_blank')` |

**2. Deep-link support in ManageDocuments.tsx**

Add `useSearchParams` on mount. If `?doc=` param is present, parse it as a number and set `selectedDocId` so the `GovernanceDocumentDetail` drill-down opens automatically.

**3. Show both name and description in Stage Documents list**

In `StageDocumentsPanel.tsx` (after line 509, below the title/badge row), add the description as a secondary line:

```tsx
{docData?.description && (
  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
    {docData.description}
  </p>
)}
```

### Files Modified
| File | Change |
|------|--------|
| `src/components/stage/StageDocumentsPanel.tsx` | Fix 2 navigation links + add description display |
| `src/components/document/DocumentLibraryBrowser.tsx` | Fix 1 navigation link |
| `src/pages/AdminDocumentAIReview.tsx` | Fix 1 navigation link |
| `src/pages/ManageDocuments.tsx` | Read `?doc=` query param on mount, auto-open detail |

### No Data Changes
No database modifications — you'll handle deduplication through the admin UI.

