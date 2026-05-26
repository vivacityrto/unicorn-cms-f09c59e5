## Goal
Make the lesson list sidebar on `AcademyLessonViewerPage` easier to scan by removing redundant course name suffixes and visually separating lesson code prefixes from human-readable titles.

## File
`src/pages/client/AcademyLessonViewerPage.tsx`

## Changes

### 1. Strip course name suffix from lesson titles (sidebar only)

Add a local helper function just before the JSX `return`:

```
function stripCourseSuffix(lessonTitle: string, courseTitle: string): string {
  const escaped = courseTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return lessonTitle.replace(new RegExp(`[-\\s]+${escaped}$`, "i"), "").trim();
}
```

Use it when rendering each lesson title in the sidebar lesson list. Only affects the sidebar; lesson titles elsewhere (breadcrumb, page heading, course overview) remain unchanged.

### 2. Split code prefix from human-readable title

After stripping the course suffix, extract a code prefix matching `/^(M\d+-L?\d*)-?/i` and render it as a small mono badge next to the remaining readable title.

```
<span className="truncate flex items-center gap-1.5">
  {codePrefix && (
    <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0 bg-muted px-1 rounded">
      {codePrefix}
    </span>
  )}
  <span className="truncate">{readableTitle || l.title}</span>
</span>
```

If no code prefix is found, fall back to the stripped title as-is.

## Out of scope
- Module section headers
- Progress bar
- Lock/check icons
- Active state styling
- Navigation behaviour
- Any other part of the lesson viewer page