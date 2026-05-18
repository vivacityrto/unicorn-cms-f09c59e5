## Fix raw HTML showing in stage tooltip

Tooltips on `PackageStageStepper` render `stage_description` as plain text, but the data is HTML — so users see raw `<p>`, `&nbsp;`, etc. Flatten to plain text and truncate for tooltip use.

### 1. `src/lib/sanitize.ts` — add `htmlToText` helper

Append a new exported function using the existing DOMPurify dependency:

- Strips all tags (`ALLOWED_TAGS: []`, `KEEP_CONTENT: true`) so text content is preserved
- Collapses whitespace (`\s+` → single space) and trims
- Optional `maxLen` truncates with an ellipsis (`…`)
- Safely handles `null` / `undefined`

Signature: `htmlToText(html: string | null | undefined, maxLen?: number): string`

### 2. `src/components/client/package-dashboard/PackageStageStepper.tsx`

- Import `htmlToText` from `@/lib/sanitize`
- In `StageNode`'s `TooltipContent`, replace the direct `{stage.stage_description}` render with `htmlToText(stage.stage_description, 220)`
- Keep the existing conditional so the muted description div doesn't render when there's no description

No other files change. No DB, no RPC, no data migration. The HTML in `stage_description` stays as-is (intentional rich storage).

### Verification

1. TypeScript compiles clean.
2. Hover stages with HTML descriptions → plain text, no tags, truncated at ~220 chars with `…`.
3. Hover short-description stages → no truncation.
4. Hover description-less stages → only the stage name shows, no empty div.

### Out of scope

DB/migrations, the `stage_description` data itself, other surfaces rendering stage descriptions (e.g. `AddExistingStageDialog`), and full rich-text rendering (would use `sanitizeHtml` + `dangerouslySetInnerHTML` in a detail panel, not a tooltip).
