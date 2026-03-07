

## Plan: Show current folder path next to root folder name in browser header

The user wants the current browsed folder displayed inline next to the root folder name (e.g., "46110-Academy of Global Business Training  **› _QA2 VET Student Support**"), rather than on a separate breadcrumb line. If the current folder is nested more than one level deep, prefix with "...".

### Changes to `src/components/documents/SharePointFileBrowser.tsx`

**Modify the CardTitle (lines 142-145):**
- After the root name, append the current folder name inline with a different icon (e.g., `Folder` instead of `FolderOpen`)
- If `folderStack` has more than 2 entries (meaning we're deeper than a direct child), show "..." before the current folder name
- The current folder is the last entry in `folderStack` (or derived from the browse state)
- Use `ChevronRight` as separator, and a `Folder` icon (closed) for the current subfolder to differentiate from the root's `FolderOpen`

**Remove the separate breadcrumb block (lines 152-166):**
- No longer needed since the path info moves into the header line

**Keep the Back button** in CardContent as-is for navigation.

### Example rendering
- At root: `📂 46110-Academy of Global Business Training`
- One level deep: `📂 46110-Academy of Global Business Training  ›  📁 _QA2 VET Student Support`
- Two+ levels deep: `📂 46110-Academy of Global Business Training  ›  ...  ›  📁 Deep Subfolder`

### File
| File | Change |
|------|--------|
| `src/components/documents/SharePointFileBrowser.tsx` | Inline current folder in header, remove separate breadcrumb |

