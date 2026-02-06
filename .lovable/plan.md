
# Fix: Upload Document Dialog Issues

## Problem Summary

Two issues are preventing document uploads:

1. **Storage "Invalid key" Error**: File names containing special characters (en-dashes, spaces, accented characters) cause Supabase Storage to reject the upload
2. **Upload Button Not Visible**: The dialog footer gets cut off on smaller screens or when many files are selected

---

## Solution Overview

### Issue 1: Sanitize Storage File Paths

Create a helper function to sanitize file names before constructing the storage path:
- Replace spaces with underscores
- Replace special dashes (en-dash, em-dash) with regular hyphens
- Remove or replace any other problematic characters
- Preserve the original filename in the database record

### Issue 2: Fix Dialog Layout

Restructure the dialog to ensure buttons are always visible:
- Use flexbox with `flex-col` on the content
- Make the form content area scrollable, not the entire dialog
- Keep the footer fixed at the bottom

---

## Technical Changes

### File: `src/hooks/usePortalDocuments.tsx`

**Add filename sanitization function:**

```typescript
// Sanitize filename for Supabase Storage paths
function sanitizeStoragePath(filename: string): string {
  return filename
    .normalize('NFD')                          // Decompose accents
    .replace(/[\u0300-\u036f]/g, '')           // Remove accent marks
    .replace(/[\u2013\u2014]/g, '-')           // Replace en-dash/em-dash with hyphen
    .replace(/\s+/g, '_')                      // Replace spaces with underscores
    .replace(/[^a-zA-Z0-9._-]/g, '')           // Remove any remaining special chars
    .replace(/_+/g, '_')                       // Collapse multiple underscores
    .replace(/-+/g, '-');                      // Collapse multiple hyphens
}
```

**Update storage path construction (line 147):**

```typescript
// Before
const storagePath = `${tenantId}/${direction}/${Date.now()}_${file.name}`;

// After
const sanitizedName = sanitizeStoragePath(file.name);
const storagePath = `${tenantId}/${direction}/${Date.now()}_${sanitizedName}`;
```

The original `file.name` is still saved in the `file_name` database column for display purposes.

---

### File: `src/components/documents/dialogs/UploadDocumentDialog.tsx`

**Restructure the dialog layout to ensure footer visibility:**

1. Remove form from controlling scroll - move scroll to content area only
2. Use flex layout to pin footer at bottom
3. Ensure proper button visibility with explicit widths

```tsx
<DialogContent className="max-w-md flex flex-col max-h-[85vh]">
  <DialogHeader className="flex-shrink-0">
    {/* Header content */}
  </DialogHeader>

  <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
    {/* Scrollable content area */}
    <div className="flex-1 overflow-y-auto space-y-6 py-2">
      {/* File upload area */}
      {/* Share toggle */}
    </div>

    {/* Fixed footer - always visible */}
    <DialogFooter className="flex-shrink-0 pt-4 border-t mt-4">
      <Button type="button" variant="outline" onClick={handleClose}>
        Cancel
      </Button>
      <Button type="submit" disabled={...}>
        Upload {count} file(s)
      </Button>
    </DialogFooter>
  </form>
</DialogContent>
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/usePortalDocuments.tsx` | Add `sanitizeStoragePath()` function; use it when constructing storage paths |
| `src/components/documents/dialogs/UploadDocumentDialog.tsx` | Restructure layout to use flex column with scrollable content area and fixed footer |

---

## Expected Outcome

- File names like `AGBT – ASQA Non-Compliance Response.docx` will be stored as `AGBT_-_ASQA_Non-Compliance_Response.docx` in storage
- Original filename preserved in database for display
- Upload/Cancel buttons will always be visible regardless of file count or screen size
