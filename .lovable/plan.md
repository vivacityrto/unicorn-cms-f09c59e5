## Objective
Improve the file upload handler in `src/pages/client/ClientFilesPage.tsx` with client-side file type validation, better error messages, and a matching `accept` attribute on the hidden file input.

## Scope
Only `src/pages/client/ClientFilesPage.tsx` is modified. No other files touched.

## Changes

### 1. File type validation
Before `setUploading(true)`, validate the selected file against an allowlist.

**Allowed types:**
- PDF: `application/pdf`, `.pdf`
- Word: `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `.doc`, `.docx`
- Excel: `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `.xls`, `.xlsx`
- PowerPoint: `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `.ppt`, `.pptx`
- Images: `image/jpeg`, `image/png`, `.jpg`, `.jpeg`, `.png`
- CSV: `text/csv`, `.csv`

**Logic:** extract the extension from `file.name`, check it against the allowed extension list, and check `file.type` against the allowed MIME list. If either matches, allow the upload. If neither matches, call `toast.error('File type not supported. Allowed types: PDF, Word, Excel, PowerPoint, images (JPG/PNG), CSV.')`, clear `e.target.value`, and return early.

### 2. Improved error handling
Replace the current catch block's generic `toast.error(...)` with conditional logic based on `err.message`:

- If message contains `"404"`: `'Upload destination not found in SharePoint. Please contact your Vivacity consultant.'`
- If message contains `"403"`: `'Permission denied uploading to SharePoint. Please contact your Vivacity consultant.'`
- If message contains `"502"` or `"Failed to resolve uploads folder"`: `'SharePoint folder could not be reached. Please try again or contact your Vivacity consultant.'`
- If message contains `"413"` or `"too large"`: `'File is too large. Maximum size is 50 MB.'`
- Otherwise: `` `Upload failed: ${err.message}` ``

### 3. Update `accept` attribute
Change the hidden `<input type="file">` `accept` attribute to:
```
accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.csv"
```

## Verification
- Build passes with no errors.
- Uploading an unsupported file type triggers the toast and stops before uploading.
- Uploading a supported file proceeds normally.
- Simulated error responses (e.g. 404, 403) produce the correct human-friendly toast messages.
