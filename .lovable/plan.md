

## Plan: Lovable Prompt Button + Screenshot Paste + Drag-and-Drop

### Changes to `src/pages/SuggestionDetail.tsx`

**1. Wand Prompt Button (header, next to back arrow)**
- Import `Wand2` from lucide-react
- Add a `handleCopyPrompt` function that:
  - Resolves dropdown IDs to labels (type, priority, category, status, impact)
  - Builds a structured Markdown prompt with title, description, source context, resolution notes, attachment filenames
  - Copies to clipboard via `navigator.clipboard.writeText()`
  - Shows toast "Prompt copied to clipboard"
- Render a Wand2 icon button next to the title in the header row (line 156-161)

**2. Screenshot Paste Support**
- Add `onPaste` handler on the outer container div (line 155)
- Detect `image/*` items in `clipboardData.items`
- Convert blob to `File` named `screenshot-{timestamp}.png`
- Upload via existing `uploadAttachment.mutateAsync()`
- Show toast "Screenshot uploaded"

**3. Drag-and-Drop on Attachments Card**
- Add `onDragOver`, `onDragLeave`, `onDrop` handlers on the Attachments Card (line 324)
- Track `isDragging` state for visual highlight (dashed border)
- Extract files from `dataTransfer.files` and upload each
- Add helper text "Paste screenshot anywhere or drag files here"

### Prompt Template Format
```
## Fix: {title}

**Type:** {type} | **Priority:** {priority} | **Category:** {category}
**Status:** {status} | **Impact:** {impact}

### Description
{description}

### Source Context
- Page: {sourcePageUrl} ({sourcePageLabel})
- Area: {sourceArea}
- Component: {sourceComponent}

### Resolution Notes
{resolutionNotes}

### Attachments
- {filename1}
- {filename2}

Please fix this issue.
```

Empty sections will be omitted.

