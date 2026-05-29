## Scope
One file only: `src/pages/ManageDocuments.tsx`

## Problem
The Name column `<TableCell>` at approximately line 1683 has `minWidth: 200px` and `maxWidth: 300px` but no overflow clipping. The inner `<div>` uses `whitespace-nowrap` and the title `<span>` has no `truncate`, so long document names overflow into adjacent columns.

## Changes

### Change 1 — TableCell overflow clipping
Line 1683: add `overflow-hidden` to the `<TableCell>` className.

```
<TableCell className="py-6 border-r border-border/50 overflow-hidden" style={{ minWidth: '200px', maxWidth: '300px' }}>
```

### Change 2 — Title span truncation
Line 1689: add `truncate` to the title `<span>` className.

```
<span className="font-semibold text-foreground truncate">{doc.title}</span>
```

### Change 3 — Inner wrapper min-width
Line 1688: replace `whitespace-nowrap` with `min-w-0` on the inner `<div>` so flex does not prevent truncation.

```
<div className="flex items-center gap-2 min-w-0">
```

## Out of scope
- No other columns, cells, or headers
- No edge functions, database tables, or migrations
- No other pages or components