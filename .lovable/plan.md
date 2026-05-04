## Plan: Fix markdown rendering in ClientAskVivPanel

Single file edit: `src/components/ask-viv/ClientAskVivPanel.tsx`. `react-markdown` is already a project dependency (used in `TenantClickUpAISearch.tsx`), so no install needed.

### 1. Import react-markdown
Add at the top of the file:
```ts
import ReactMarkdown from "react-markdown";
```

### 2. Update `AssistantBubble` (around lines 393–472)

**a. Pre-process content** to optionally strip the duplicated "What we looked at" section when the collapsible will render it:
```ts
const hasRecords = message.records_accessed.length > 0;
const cleanedContent = hasRecords
  ? message.content.replace(
      /^##\s*What we looked at[^\n]*\n(?:[ \t]*[-*][^\n]*\n?)*/gim,
      ""
    ).trimEnd()
  : message.content;
```

**b. Replace the bubble renderer** (line 423–425):
```tsx
<div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-muted text-foreground">
  <ReactMarkdown
    components={{
      h2: ({ node, ...props }) => (
        <h2
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1 first:mt-0"
          {...props}
        />
      ),
      ul: ({ node, ...props }) => <ul className="space-y-1 pl-4" {...props} />,
      ol: ({ node, ...props }) => <ol className="space-y-1 pl-4" {...props} />,
      li: ({ node, ...props }) => <li className="text-sm list-disc" {...props} />,
      p: ({ node, ...props }) => <p className="text-sm" {...props} />,
    }}
  >
    {cleanedContent}
  </ReactMarkdown>
</div>
```

**c. Delete the duplicate gaps list** (lines 432–439) — the `## What we couldn't find` section in the markdown already covers them. Keep `ConfidenceChip` and the `records_accessed` collapsible.

No other files change.