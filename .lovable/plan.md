# Fix `&nbsp;` and other HTML entities surviving `htmlToText`

## Problem

`htmlToText` in `src/lib/sanitize.ts` uses DOMPurify with `ALLOWED_TAGS: []` to strip tags. DOMPurify removes tags but does not decode HTML entities, so `&nbsp;`, `&amp;`, `&lt;`, `&quot;` etc. survive into the output and render as literal entity text in stage tooltips.

## Change

Single file: `src/lib/sanitize.ts`.

Rewrite the body of `htmlToText` to assign the input to a detached `<div>`'s `innerHTML`, then read `textContent`. The browser parser decodes entities and strips tags in one pass. Detached elements don't execute scripts or fire event handlers, so this is XSS-safe for pure text extraction.

```ts
export function htmlToText(html: string | null | undefined, maxLen?: number): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = (tmp.textContent || tmp.innerText || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLen && text.length > maxLen) {
    return text.slice(0, maxLen).trimEnd() + '…';
  }
  return text;
}
```

Keep the existing JSDoc and signature. Keep the `DOMPurify` import — `sanitizeHtml`, `sanitizeEmailHtml`, and `textToSafeHtml` still use it.

## Out of scope

- Other helpers in `sanitize.ts`
- Call sites (`PackageStageStepper.tsx`, etc.) — signature unchanged
- Data / DB

## Verify

1. TypeScript compiles clean.
2. Stage tooltips containing `&nbsp;`, `&amp;`, `&lt;`, `&quot;` render the decoded characters, not literal entity text.
3. Truncation at ~220 chars still works.
