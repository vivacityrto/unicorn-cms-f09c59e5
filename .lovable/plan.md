## Fix: stale similarity thresholds suppress all SRTO corpus chunks

### Root cause

`retrieve-srto-context` was lowered to a default `threshold` of `0.5` to match the score distribution of `text-embedding-3-small` (relevant matches cluster at 0.45–0.6). But two callers still pass an explicit `threshold: 0.65` override, so retrieval returns zero rows and the AI draft proceeds ungrounded with `confidence: "low"` and `corpus_chunks_used: []`.

### Audit of all four target functions (plus the two compliance-assistant peers)

| Function | Calls `retrieve-srto-context`? | Hardcoded threshold | Action |
|---|---|---|---|
| `draft-finding` | Yes (line 445) | `threshold: 0.65` (line 454) | **Remove the `threshold` field** — let the function default apply. |
| `draft-executive-summary` | Yes (line 352, in a `Promise.allSettled` per top clause) | `threshold: 0.65` (line 358) | **Remove the `threshold` field.** |
| `analyse-evidence` | Yes — but does **not** pass `threshold`. | none | No change. Already correct. |
| `compliance-assistant` | **No** — calls `search_vector_embeddings` RPC directly with `p_similarity_threshold: 0.7` (line 483) | n/a | Out of scope per the brief ("less critical, but check"). This is a different RPC against a different corpus (`vector_embeddings`, not `srto_corpus`) and a different score distribution; the user explicitly scoped the fix to `retrieve-srto-context` callers. **Leave untouched.** |
| `compliance-assistant-client` | Same as above (line 408) | n/a | **Leave untouched** for the same reason. |

So the actual code change is two lines deleted, in two files.

### Changes

**1. `supabase/functions/draft-finding/index.ts`** — line 454: delete `threshold: 0.65,` from the `body` of the `retrieve-srto-context` fetch. The remaining fields (`query`, `top_k: 6`, `clause`, `framework`) are correct.

**2. `supabase/functions/draft-executive-summary/index.ts`** — line 358: delete `threshold: 0.65,` from the per-clause retrieval body. The remaining fields (`query`, `top_k: 4`, `clause`, `framework`) are correct.

No named-constant overrides are needed — neither function has a high-precision/low-recall justification for diverging from the platform default. Single source of truth lives in `retrieve-srto-context`'s `DEFAULT_THRESHOLD`.

### Out of scope (confirmed)

- `retrieve-srto-context` — already correct.
- `analyse-evidence` — already passes no threshold.
- `compliance-assistant` / `compliance-assistant-client` — different RPC (`search_vector_embeddings`), different corpus, different score distribution. Not part of this fix.
- Corpus, embeddings, prompt template — unchanged.

### Validation

After deploy, this call should return `corpus_chunks_used` with at least one Practice Guide entry and `confidence` should no longer be `"low"`:

```bash
curl -X POST "https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/draft-finding" \
  -H "Authorization: Bearer <super-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"audit_id":"3b1fbbee-0c1d-4c9b-9b59-f2d6205ecbdd","response_id":"5ee3ed7f-0dbb-4a68-a5b4-a29e3720fe1f"}'
```

`draft-executive-summary` will similarly start populating its per-clause corpus excerpts in the prompt block.
