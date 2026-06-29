## Bug Fix: SharePoint Link Insertion Focus Trap

### Problem
In `src/components/ui/sharepoint-link-dialog.tsx`, `onSelectLink` fires while the Radix Dialog is still mounted and holding its focus trap. TipTap's `editor.chain().focus()` cannot execute correctly in that state, so the link is silently not inserted.

### Fix
Close the dialog first, then defer the callback by one animation frame so Radix completes its focus restoration before TipTap takes focus.

### Changes

**1. `handleInsertFolderLink` (lines 50–55)**
Swap order: call `onOpenChange(false)` before `onSelectLink`, wrapping the callback in `requestAnimationFrame`.

**2. `handleInsertCustomUrl` (lines 57–63)**
Swap order: capture `url`, clear input, close dialog, then `requestAnimationFrame(() => onSelectLink(url))`.

**3. `SharePointFileBrowser` inline `onSelectLink` (lines 121–127)**
Swap order: close dialog first, then defer the callback one animation frame.

No other files touched.