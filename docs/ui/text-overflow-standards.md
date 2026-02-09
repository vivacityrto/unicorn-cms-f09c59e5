# Text Overflow Standards

This document defines standardized text handling for long strings across Unicorn 2.0.

## Quick Reference

| Mode | Class | Use Case |
|------|-------|----------|
| Wrap | `whitespace-normal break-words` | Headings, paragraphs, labels |
| Truncate | `truncate` | Secondary info with tooltip/reveal |
| Clamp | `line-clamp-2`, `line-clamp-3` | Descriptions, previews |
| Mono | `font-mono text-xs break-all` | IDs, codes, API keys |
| No Wrap | `whitespace-nowrap` | Short tokens (dates) |

---

## Text Component

Use the `Text` component for consistent overflow handling:

```tsx
import { Text, TruncatedText, CopyableId, textUtils } from "@/components/ui/text";

// Normal wrapping (default)
<Text>This text will wrap naturally across lines</Text>

// Truncation with automatic tooltip
<TruncatedText maxWidth="max-w-[200px]">
  Very long text that gets truncated with a tooltip
</TruncatedText>

// Multi-line clamp
<TruncatedText lines={2}>
  Long description that will be clamped to two lines with ellipsis
</TruncatedText>

// Copyable ID
<CopyableId>abc123-def456-ghi789</CopyableId>

// Monospace for codes
<Text overflow="mono">API_KEY_12345</Text>
```

---

## Component-Level Rules

### 1. Headings and Titles

**Rule**: Wrap by default, never overflow container.

```tsx
// ✅ Correct
<h1 className="whitespace-normal break-words">
  Very Long Heading That Should Wrap Across Multiple Lines
</h1>

// ❌ Wrong - will overflow
<h1 className="whitespace-nowrap">
  Very Long Heading...
</h1>
```

### 2. Table Cells

**Primary column**: Can wrap
```tsx
<TableCell className="font-medium whitespace-normal break-words max-w-[200px]">
  {user.name}
</TableCell>
```

**Secondary column**: Truncate with tooltip (md+ only)
```tsx
<TableCell className="truncate max-w-[250px]" title={user.email}>
  {user.email}
</TableCell>
```

### 3. Chips and Badges

**Rule**: Max width with truncation, tooltip on hover.

```tsx
<Badge className="max-w-full truncate" title={longStatus}>
  {longStatus}
</Badge>
```

### 4. Buttons

**Rule**: Avoid truncation. Stack or wrap in footers.

```tsx
// ✅ Correct - stack on mobile
<div className="flex flex-col-reverse sm:flex-row gap-2">
  <Button variant="outline">Cancel</Button>
  <Button>Save Changes</Button>
</div>

// ❌ Wrong - truncated button text
<Button className="truncate">Save Changes</Button>
```

### 5. Sidebar Items

**Rule**: Truncate with tooltip on large screens.

```tsx
<span className="truncate" title={itemLabel}>
  {itemLabel}
</span>
```

### 6. Toasts/Notifications

**Rule**: Viewport-safe width, wrap content.

```tsx
// Already configured in sonner/toast component
// Width: w-[min(92vw,28rem)]
// Content wraps naturally
```

---

## CSS Utility Classes

Use these classes from `index.css`:

```css
/* Default wrapping */
.text-wrap-normal { white-space: normal; word-break: break-word; }

/* Safe truncation */
.text-truncate-safe { @apply truncate; }

/* Multi-line clamp */
.text-clamp-2 { -webkit-line-clamp: 2; }
.text-clamp-3 { -webkit-line-clamp: 3; }

/* Monospace for IDs */
.text-mono-id { @apply font-mono text-xs; word-break: break-all; }

/* Force break anywhere (use sparingly) */
.text-break-all { word-break: break-all; }
```

---

## Long Unbroken Strings

For worst-case tokens (no spaces):

| Content Type | Handling |
|--------------|----------|
| Audit IDs | `break-all` with `font-mono` |
| API keys | `break-all` with `font-mono` |
| URLs | `break-all` |
| Normal text | `break-words` (default) |

```tsx
// IDs and codes
<span className="font-mono text-xs break-all">
  {auditId}
</span>

// Normal text (default)
<span className="break-words">
  {longName}
</span>
```

---

## Truncation Requires Reveal Method

Whenever you truncate text, provide one of:

1. **Tooltip** - For short reveals
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <span className="truncate max-w-[200px]">{text}</span>
  </TooltipTrigger>
  <TooltipContent>{text}</TooltipContent>
</Tooltip>
```

2. **Copy button** - For IDs and emails
```tsx
<CopyableId>{userId}</CopyableId>
```

3. **View details action** - For complex content
```tsx
<Button variant="link" size="sm">View details</Button>
```

---

## Testing Checklist

- [ ] Long strings don't cause horizontal scroll
- [ ] Critical text remains readable on mobile (320px)
- [ ] Truncated fields have reveal method
- [ ] Modals/drawers remain usable with long content
- [ ] Tables don't break at narrow widths

Use the QA harness at `/admin/qa/responsive` to verify.

---

## Migration Guide

### Before (ad hoc)
```tsx
<span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
  {text}
</span>
```

### After (standardized)
```tsx
<TruncatedText maxWidth="max-w-[200px]">
  {text}
</TruncatedText>
```
