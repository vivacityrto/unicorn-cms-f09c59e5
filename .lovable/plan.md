
# Fix: Upload Document Dialog Button Not Accessible

## Problem Analysis
The Upload button in the UploadDocumentDialog is not clickable. From the screenshot, I can see the dialog shows:
- 3 selected files
- "Add more files" button
- "Share with client immediately" toggle
- Only "Cancel" is visible in the footer area

The issue is that the DialogFooter is being cut off or the Upload button is not rendering properly due to layout/overflow issues.

## Root Cause
The `DialogFooter` uses `flex-col-reverse sm:flex-row` layout, and with `sm:space-x-2` for spacing. The dialog content structure places the form (including footer) inside the scrollable area, but the content may be overflowing in a way that hides the Upload button.

## Solution
Restructure the UploadDocumentDialog to:

1. Make the file list area scrollable (with a max-height) instead of the entire dialog
2. Keep the DialogFooter always visible at the bottom
3. Add proper styling to ensure both buttons are visible

## Technical Changes

### File: `src/components/documents/dialogs/UploadDocumentDialog.tsx`

**Changes:**
1. Move `DialogFooter` outside the form's scrollable content area
2. Add a scrollable container with `max-h-[40vh]` for the file list when multiple files are selected
3. Ensure the footer buttons are styled correctly with proper spacing
4. Add `flex-shrink-0` to the footer to prevent it from being compressed

```text
Structure After Fix:
+----------------------------------+
| DialogHeader                     |
|   - Title                        |
|   - Description                  |
+----------------------------------+
| Form Content                     |
|   - File Upload Area             |
|     (scrollable if many files)   |
|   - Share Toggle                 |
+----------------------------------+
| DialogFooter (always visible)    |
|   [Cancel]  [Upload X files]     |
+----------------------------------+
```

**Key Code Changes:**
- Wrap the selected files list in a scrollable div with `max-h-[200px] overflow-y-auto`
- Ensure the form uses `flex flex-col` layout with the footer at the bottom
- Add explicit `pt-4` or similar spacing to separate footer from content
