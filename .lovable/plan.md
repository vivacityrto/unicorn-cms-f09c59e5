## Fix: clause filter zeroes out retrieval for non-SRTO-clause audit templates

### Root cause

`srto_corpus.clause` holds real SRTO 2025 clause numbers (1.1, 1.5, 2.6, 4.1...) plus 102 NULL chunks for legislative instruments. Audit templates like RTO Due Diligence use their own internal section codes (Gov-1, TAQ-1...). When `draft-finding` and `draft-executive-summary` pass these template-internal codes as `clause` to `retrieve-srto-context`, the RPC predicate `c.clause = filter_clause` matches nothing → zero chunks → ungrounded draft with `confidence: "low"`.

The clause string is still useful as **prompt context** (so Gemini knows which audit standard the question maps to). It is **not** a reliable SQL filter because the audit template vocabulary and the corpus vocabulary don't align.

### Audit of `retrieve-srto-context` (verified, no change needed)

- Edge function (`supabase/functions/retrieve-srto-context/index.ts`): `clause` is optional input, only validated when present, and forwarded to the RPC as `filter_clause` (null when absent).
- RPC (`match_srto_chunks`, latest migration `20260430231030_...sql`, line 48): predicate is `(filter_clause is null or c.clause = filter_clause)` — correct "no filter when null" semantics.

So the fix is purely in the two callers. The retrieval service is already well-behaved.

### Changes

**1. `supabase/functions/draft-finding/index.ts`** (line ~456)
Remove `clause: ctx.clause || undefined,` from the body of the `retrieve-srto-context` fetch. Keep `query`, `top_k: 6`, and `framework`. The embedded `audit_statement` already carries the regulatory subject for vector similarity to do its work.

The `clause` value continues to be passed into the Gemini prompt template (line 204: `QUESTION (clause ${ctx.clause ?? 'n/a'})`) — that is unchanged.

**2. `supabase/functions/draft-executive-summary/index.ts`** (line ~360)
Remove `clause,` from the per-clause retrieval body inside the `Promise.allSettled` loop. Keep `query`, `top_k: 4`, and `framework`. The query text already concatenates `summary + detail + clause` (line 348), so the clause string still influences the embedding — it just stops acting as a hard SQL filter.

The clause continues to appear in the assembled prompt (line 424, 437) and in the `clauses_retrieved` audit log payload (line 597). Unchanged.

### Out of scope (confirmed)

- `srto_corpus.clause` column — fine as-is.
- `retrieve-srto-context` — already treats clause as optional exact-match. No code or doc change required; behaviour already matches the brief's expectation.
- `match_srto_chunks` RPC — already implements null-safe filter.
- `analyse-evidence` — does not pass `clause` (already correct).
- `compliance-assistant` / `compliance-assistant-client` — different RPC, different corpus.
- Threshold (still 0.5 default), prompt templates, embeddings, and corpus content — all unchanged.

### Validation

Re-run the same draft-finding call against Smart Nation's RTO Due Diligence audit:

```bash
curl -X POST "https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/draft-finding" \
  -H "Authorization: Bearer <super-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"audit_id":"3b1fbbee-0c1d-4c9b-9b59-f2d6205ecbdd","response_id":"5ee3ed7f-0dbb-4a68-a5b4-a29e3720fe1f"}'
```

Expected: `corpus_chunks_used` populated with 3-6 entries (likely Practice Guide on Fit and Proper Person Requirements + related), `confidence` is `medium`/`high`, and `uncertainty_notes` no longer reports empty retrieval. `standard_reference` should cite a specific standard or Practice Guide section drawn from the retrieved chunks.

`draft-executive-summary` will similarly start populating per-clause excerpts in the prompt block for DD-style audits, while continuing to work for SRTO-clause audits (where the embedded query naturally surfaces the matching clause anyway).
