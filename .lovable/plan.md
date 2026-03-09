

## Display Root Name next to "Root folder link" label

**What**: Add the `root_name` from settings prominently next to the "Root folder link" label text, so users can immediately confirm which SharePoint folder is connected.

**Where**: `src/components/client/SharePointFolderConfig.tsx`, lines 331-355 (the `<Label>` block).

**Change**: After the link icon and "Root folder link" text, append the `root_name` in a bold/semibold style when available. Applied to all three label variants (valid URL, global site URL fallback, plain text).

```text
Before:  Root folder link ↗
After:   Root folder link ↗  — Documents - 7535 - Some RTO Name
```

Specifically:
- After each "Root folder link" / "Browse Client Folder root" text + icon, add: `{settings?.root_name && <span className="font-semibold text-foreground ml-1">— {settings.root_name}</span>}`
- This keeps the existing clickable link and just appends the folder name inline
- When `root_name` is null (not yet validated), nothing extra shows

One file, ~6 lines added. No schema or logic changes.

