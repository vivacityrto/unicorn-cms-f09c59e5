

## Plan: Simplify Root Folder section layout

The current "Root Folder" status panel (lines 392-431) duplicates information already available via the "Root folder link" label. Per the annotated screenshot, we will remove the redundant panel and relocate its two useful data points.

### Changes to `src/components/client/SharePointFolderConfig.tsx`

**Remove entirely:**
- The "Root Folder" bordered panel containing: folder name, "Open in SharePoint" button, Drive ID, and Last validated

**Relocate:**
- **Drive ID** — show as small muted text *below* the URL input field (below the "Copy link" hint)
- **Last validated** — show as small muted text *above* the "Root folder link" label

**Grid change:**
- With the Root Folder panel removed, the Shared Folder section no longer needs a 50/50 grid — it becomes full-width when valid

### Resulting layout (top to bottom)
```text
┌─ CardHeader ──────────────────────────────────────────────┐
│ SharePoint Folder  [Valid]          Enabled [toggle]      │
│ Connect a SharePoint folder as the document root...       │
├─ CardContent ─────────────────────────────────────────────┤
│ Last validated: 06/03/2026 22:15                          │
│ ROOT FOLDER LINK (with visit icon)                        │
│ [ url input          ] [Save Link] [Validate & Save]     │
│ ℹ Use "Copy link" from SharePoint...                      │
│ Drive ID: b!XtHlgnqHCckGB5J3E16...                       │
│                                                           │
│ ┌─ Shared Folder Configuration (full width) ───────────┐ │
│ │ ...                                                   │ │
│ └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### Files
| File | Change |
|------|--------|
| `src/components/client/SharePointFolderConfig.tsx` | Remove Root Folder panel; move Drive ID below input, Last validated above label; remove grid wrapper around Shared Folder |

