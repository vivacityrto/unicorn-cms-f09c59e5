## Tighten the prompt — make the ≤30-word quote rule unmistakable

### Problem

`validateDraft` (in `_validation.ts` for both `draft-executive-summary` and `draft-finding`) hard-rejects any text inside straight or curly double-quotes that runs longer than 30 words. The rejection forces a retry, doubling latency and token spend on a constraint Gemini could satisfy if it were stated unambiguously.

The current prompts mention the rule but softly:

- `draft-executive-summary/index.ts:82` → `- Quote up to ~30 words from any single Standard.` (the "~" invites overshoot)
- `draft-executive-summary/index.ts` "MUST NOT DO" block has no quote-length entry; the limit only appears in the "MAY DO" block.
- `draft-finding/index.ts:102` → `- Quote a single short fragment (≤30 words) from a Standard…` (correct, but buried mid-list)
- `draft-finding/index.ts:109` → `- Quote any Standard verbatim beyond 30 words.` (correct, but no mechanic — the model doesn't know what counts as "a quote")

Neither prompt tells the model **how the limit is measured** (whitespace-delimited words inside any double-quoted span) or **what to do instead** (paraphrase, or split into two short quotations). The retry message in `draft-executive-summary` already explains this well — we should hoist that guidance into the system prompt so the first attempt passes.

Editorial intent stays intact: short verbatim quotes are still encouraged for precision; only overlong ones are forbidden.

### Changes

**1. `supabase/functions/draft-executive-summary/index.ts`**

Tighten line 82 and add an explicit MUST NOT entry. Replace:

```
- Quote up to ~30 words from any single Standard.
```

with:

```
- Quote short fragments from a Standard when precision matters — strictly ≤30 words per quoted span, in straight double quotes, with the clause cited inline.
```

In the "WHAT YOU MUST NOT DO" block (after line 93), add:

```
- Place more than 30 whitespace-delimited words inside any single pair of double quotes (straight " or curly " "). The validator counts words inside each quoted span; a 31-word quote fails the draft. If a passage is longer, paraphrase the Standard's intent in your own words, or split it into two short quotations with a paraphrase between them.
```

**2. `supabase/functions/draft-finding/index.ts`**

Tighten line 102 and replace the existing "Quote any Standard verbatim beyond 30 words." entry with the same explicit mechanic. Replace line 102:

```
- Quote a single short fragment (≤30 words) from a Standard when precision matters, in quotation marks with the clause cited.
```

with:

```
- Quote short fragments from a Standard when precision matters — strictly ≤30 words per quoted span, in straight double quotes, with the clause cited inline.
```

Replace line 109 (`- Quote any Standard verbatim beyond 30 words.`) with:

```
- Place more than 30 whitespace-delimited words inside any single pair of double quotes (straight " or curly " "). The validator counts words inside each quoted span; a 31-word quote fails the draft. If a passage is longer, paraphrase the Standard's intent in your own words, or split it into two short quotations with a paraphrase between them.
```

### Out of scope

- `_validation.ts` — the 30-word rule is a deliberate compliance/copyright guard; not loosening it.
- Retry messages — already informative; will continue to act as a backstop.
- Exemplars, retrieval, parsing, model selection — untouched.
- `analyse-evidence` — does not produce quoted Standard excerpts; no change needed.

### Validation

Re-run the same two curl probes used previously:

```bash
curl -X POST ".../draft-finding"            -d '{"audit_id":"3b1fbbee-…","response_id":"5ee3ed7f-…"}'
curl -X POST ".../draft-executive-summary"  -d '{"audit_id":"3b1fbbee-…"}'
```

Expected: first-attempt success (no `quote exceeds 30 words` retries in edge logs); drafts still contain short verbatim quotes from the corpus where the model judges them useful.
