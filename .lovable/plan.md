## Bug: SharePoint file link not inserted into note editor

### Root cause (confirmed)
`node_modules` contains 10+ nested copies of `prosemirror-model` (under `prosemirror-gapcursor`, `prosemirror-tables`, `prosemirror-commands`, `prosemirror-schema-list`, etc.). Vite bundles multiple module instances, so when TipTap parses an HTML string via `insertContent('<a>...</a>')`, the DOM parser produces a Fragment from a *different* `prosemirror-model` instance than the editor's schema. ProseMirror throws `RangeError: Can not convert ... to a Fragment` inside `chain().run()`, the transaction is swallowed, and the user sees the dialog close with nothing inserted. No console error surfaces because TipTap chains catch and discard failed steps.

This matches the symptom exactly: Add Note → dialog closes cleanly → nothing inserted → no visible error.

### Fix
In `src/components/ui/rich-text-editor.tsx`, `handleInsertLink`, replace the HTML-string `insertContent` call with a ProseMirror JSON node array. JSON nodes resolve through the editor's own schema (`schema.nodeType()` / `schema.marks`) — no HTML parser, no second `prosemirror-model` instance, no version mismatch.

```ts
const handleInsertLink = (url: string, linkText?: string) => {
  if (!url || !editor) return;
  const { from, to } = editor.state.selection;
  const hasSelection = from !== to;

  if (hasSelection) {
    // Apply link mark to existing selection — no HTML parsing involved.
    editor.chain().focus().setLink({ href: url }).run();
  } else {
    const displayText = linkText || url.split('/').pop() || url;
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: 'text',
          text: displayText,
          marks: [
            { type: 'link', attrs: { href: url } },
            { type: 'underline' },
          ],
        },
        { type: 'text', text: ' ' },
      ])
      .run();
  }
};
```

### Scope
- One file touched: `src/components/ui/rich-text-editor.tsx` — only the `else` branch of `handleInsertLink` (HTML string → JSON node array). The `if (hasSelection)` branch already uses `setLink`, which is schema-native and unaffected.
- The existing `onOpenChange(false) + requestAnimationFrame` wrapper in `sharepoint-link-dialog.tsx` stays as-is.
- No DB changes. No dependency changes. We are not attempting to dedupe `prosemirror-model` in this fix — that would be a larger lockfile change and is not required once we stop routing through the HTML parser.

### Verification
1. Add Note → open SharePoint dialog → click the link icon on a file → underlined filename link appears in the editor, dialog closes.
2. Edit Note → same flow → still works (no regression).
3. Select text in the editor → open SP dialog → pick a file → selected text becomes the link (existing `setLink` branch).
4. Paste-a-URL flow and Insert Root Folder Link flow → both call the same `handleInsertLink` and should now insert reliably.
