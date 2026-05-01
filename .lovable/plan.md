## Make the 30-word quote rule discriminate Standards excerpts from AI prose

### Problem

`findOverlongQuote` in both `supabase/functions/draft-executive-summary/_validation.ts` and `supabase/functions/draft-finding/index.ts` rejects any double-quoted span over 30 words, regardless of what's inside. The 30-word cap exists to prevent reproduction of substantial verbatim Standards excerpts (compliance/copyright guard), but Gemini also uses double quotes for stylistic emphasis and reported speech. Today's two consecutive 502s on `draft-executive-summary` were Gemini wrapping its own analytical prose in quotes — false positives that will keep retrying-then-failing because the model's stylistic instinct is consistent.

### Fix

Three changes, all required.

**1. Validator becomes discriminating** — only enforce the 30-word cap when the quoted span sits next to a clause citation (the structural signal of "this is a verbatim Standards excerpt").

Edit `findOverlongQuote` in both:
- `supabase/functions/draft-executive-summary/_validation.ts` (lines 33-41)
- `supabase/functions/draft-finding/index.ts` (lines 81-89)

New logic (shared shape):

```typescript
const CLAUSE_CITATION = /\b(?:Std|Standard|Clause|Section|s\.?)\s*\d+(?:\.\d+)?(?:\([a-z]\))?/i;
const FRAMEWORK_CITATION = /\b(?:SRTOs?\s*2025|National\s*Code\s*2018|ESOS\s*Act)\s+(?:Standard|Clause|Section|s\.?)\s*\d/i;
const ADJACENT_WINDOW = 50;

function findOverlongStandardsExcerpt(text: string): { snippet: string; words: number; citation: string } | null {
  const re = /["“]([^"”]{30,})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const words = m[1].trim().split(/\s+/).length;
    if (words <= 30) continue;
    const start = m.index;
    const end = m.index + m[0].length;
    const before = text.slice(Math.max(0, start - ADJACENT_WINDOW), start);
    const after = text.slice(end, end + ADJACENT_WINDOW);
    const ctx = before + ' ' + after;
    const citation = ctx.match(FRAMEWORK_CITATION)?.[0] ?? ctx.match(CLAUSE_CITATION)?.[0];
    if (!citation) continue; // AI prose-in-quotes — not a Standards excerpt; skip.
    return { snippet: m[1].slice(0, 120) + '…', words, citation };
  }
  return null;
}
```

Update the call sites to use the richer return shape and emit the upgraded error:

- In `_validation.ts` `validateDraft`, replace the existing overlong-quote branch with a per-field scan so the error names which field failed (`executive_summary`, `overall_finding`, `risk_rationale`, `action_plan_rollup`, `uncertainty_notes`).
- In `draft-finding/index.ts` `validateDraft`, do the same per-field scan over the field set already collected at line 275.

New error message format (replaces the current `quote exceeds 30 words: "…"`):

```
Field '<fieldName>': verbatim Standards excerpt exceeds 30 words (<n> words, <n-30> over). Excerpt: "<snippet>". Clause citation found nearby: "<citation>". Suggested fix: paraphrase the Standard's intent, or split into two short quotations of ≤30 words each.
```

**2. Prompt update — disambiguate quote use**

Add a new top-level rules block to both system prompts. In `draft-finding/index.ts` insert after line 99 (start of `WHAT YOU MAY DO`); in `draft-executive-summary/index.ts` insert after line 80. Same text in both:

```
QUOTATION CONVENTIONS — STRICT
- Use double quotes ONLY for verbatim excerpts from Standards documents (SRTOs 2025, National Code 2018, ESOS Act). Always include the clause citation immediately before or after the quoted span, e.g. "...continuous improvement..." (Std 1.5).
- For your own emphasis, characterisation, or framing, use NO markup. Write directly in your own voice without quotation marks.
- For terms of art or technical labels, use italics or no markup — never double quotes.
- A double-quoted span without a nearby clause citation will be treated as a malformed Standards excerpt.
```

Then loosen the now-redundant negative phrasing:
- `draft-finding/index.ts` line 109 → replace with: `Quote a Standards excerpt longer than 30 words. The validator rejects any double-quoted span over 30 words when it sits next to a clause citation; paraphrase, or split into two short quotations.`
- `draft-executive-summary/index.ts` line 94 → same replacement text.

This keeps the hard rule visible while removing the misleading "any quotes count" framing — which was driving the model to over-correct and ultimately still trip the validator with prose-in-quotes.

**3. Tests**

Update `supabase/functions/draft-executive-summary/validation_test.ts` (the test file imports `_validation.ts` per the header comment in that module) — add cases:
- AI prose in double quotes, no citation nearby, 50 words → passes.
- Verbatim Standard quote with `(Std 1.5)` citation, 31 words → fails with new field-named error.
- Verbatim Standard quote with `(Std 1.5)`, 30 words → passes.
- Long quote with `SRTOs 2025 Standard 4.1(a)` citation 60 chars away → fails (within 50-char window of either side, and framework pattern catches it just outside; verify window covers Sam's exemplar style).

If `draft-finding` has no test file today, add `supabase/functions/draft-finding/_validation_test.ts` covering the same cases against the inlined helper. (Optional — extract `findOverlongStandardsExcerpt` + `findBannedTerm` into `supabase/functions/draft-finding/_validation.ts` to mirror the executive-summary structure and make the tests importable; the user's prior architecture note in `_validation.ts` calls out this extraction pattern as deliberate.)

### Out of scope

- 30-word cap value (kept).
- Retrieval, structured output mode, `safeParse`, retry logic (all working).
- `analyse-evidence` (no Standards quotes).
- `compliance-assistant` (different validator).
- Banned-term checks (untouched).

### Validation

```bash
curl -X POST ".../draft-executive-summary" -d '{"audit_id":"3b1fbbee-..."}'
curl -X POST ".../draft-finding"           -d '{"audit_id":"3b1fbbee-...","response_id":"5ee3ed7f-..."}'
```

Expected: 200 on first attempt for both. No `quote exceeds 30 words` retries in edge logs for prose-in-quotes cases. If a real overlong Standards excerpt sneaks through, the new error message names the field and the cited clause for one-look diagnosis.
