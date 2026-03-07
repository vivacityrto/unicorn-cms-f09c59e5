

## Plan: Show shared folder name statically in browser header

Dave, the issue is that when browsing in "Insert Link" mode, the header should always show the shared folder name (e.g., `📂 46110-Academy of Global Business Training › 📁 __ALL SRTOs 2025 policies and practice guides`) — and this should be **static**, not change as the user navigates deeper into subfolders.

### Changes

**`src/components/documents/SharePointFileBrowser.tsx`**

1. **Fetch `shared_folder_name`** alongside existing settings — add it to the select query and pass it to `FileBrowserContent`
2. **Replace the dynamic breadcrumb** in the `CardTitle` with a static display of `rootName › shared_folder_name` when `onSelectLink` is provided (link-insert mode)
3. The current dynamic folder path logic (showing navigated subfolder) only applies when NOT in link-insert mode (i.e., the Documents tab browser)

### Header rendering logic

| Context | Header displays |
|---------|----------------|
| Link-insert mode (has `onSelectLink`) | `📂 {rootName} › 📁 {sharedFolderName}` — always static |
| Documents tab (no `onSelectLink`) | `📂 {rootName}` + dynamic current folder as before |

### Minimal changes
- Add `shared_folder_name` to the settings select query (line 63)
- Add `sharedFolderName` to state and pass to `FileBrowserContent`
- In `CardTitle`, when `onSelectLink` is truthy and `sharedFolderName` exists, render the static path instead of the dynamic breadcrumb

