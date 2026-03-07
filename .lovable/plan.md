

## Plan: Two small UI tweaks

### 1. Underline inserted SharePoint link text
In `src/components/ui/rich-text-editor.tsx` line ~100, wrap the inserted filename in a `<u>` tag:
```
`<a href="${url}"><u>${displayText}</u></a> `
```

### 2. Simplify "Visit Site" button to icon-only with tooltip
In `src/components/ui/sharepoint-link-dialog.tsx` lines 95-100, replace the "Visit Site" label with just the Globe icon and add `title="Visit Folder"`:
```tsx
<Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0" title="Visit Folder">
  <a href={folderUrl!} target="_blank" rel="noopener noreferrer">
    <Globe className="h-4 w-4" />
  </a>
</Button>
```

### Files
- `src/components/ui/rich-text-editor.tsx` — underline in inserted link HTML
- `src/components/ui/sharepoint-link-dialog.tsx` — icon-only Visit button

