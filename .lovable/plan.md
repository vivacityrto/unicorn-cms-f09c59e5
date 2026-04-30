## Switch embeddings to OpenAI direct

The Lovable AI Gateway no longer accepts embedding models — only chat/completion. Six edge functions currently call the gateway for embeddings and fail with 400 "invalid model". Fix: route embeddings to OpenAI directly. Chat/completion calls stay on the gateway untouched.

`OPENAI_API_KEY` is already present in Edge Function secrets — no operator step required.

### 1. New shared helper

Create `supabase/functions/_shared/openai-embeddings.ts` exporting:

- `generateEmbedding(text: string): Promise<number[]>` — single input, validates 1536 dims
- `generateEmbeddingsBatch(texts: string[]): Promise<number[][]>` — multi-input (one OpenAI call per batch)
- `EMBEDDING_PROVIDER = 'openai'`, `EMBEDDING_MODEL_NAME = 'text-embedding-3-small'`, `EMBEDDING_DIMENSIONS = 1536`

Hard-fails (no silent fallback) if `OPENAI_API_KEY` is not set, on non-2xx OpenAI responses, or if the returned vector is not 1536-dim.

Endpoint: `https://api.openai.com/v1/embeddings`
Model: `text-embedding-3-small` (matches existing `srto_corpus.embedding` 1536-dim column and HNSW index — no schema changes).

### 2. Edge function updates

For each of the six functions: remove the gateway URL/model constants and the inline `fetch` to `ai.gateway.lovable.dev/v1/embeddings`, import the shared helper, call `generateEmbedding` / `generateEmbeddingsBatch`. Leave all chat/completion calls to the Lovable AI Gateway exactly as they are.

| File | Change |
|---|---|
| `supabase/functions/embed-srto-corpus/index.ts` | Replace per-chunk gateway calls (line ~240) with `generateEmbeddingsBatch` for efficiency when embedding 24 PDFs. Update `/health` probe (line ~347) to call `generateEmbedding('health check')` and report `{ ok, embedding_provider: 'openai', model, dim, openai_reachable, bucket_reachable, db_writable }`. The probe must perform a real test embedding, not just env-var existence. |
| `supabase/functions/retrieve-srto-context/index.ts` | Replace inline embed fetch with `generateEmbedding(query)`. |
| `supabase/functions/vector-search/index.ts` | Replace `generateEmbedding` local helper (which currently calls the gateway) with the shared helper import. |
| `supabase/functions/vector-index-update/index.ts` | Replace gateway fetch at ~line 306 with shared helper (use batch where multiple chunks). |
| `supabase/functions/vector-index-rebuild/index.ts` | Replace gateway fetch at ~line 260 with shared helper (batch). |
| `supabase/functions/compliance-assistant/index.ts` | Replace gateway fetch at ~line 466 with `generateEmbedding(query)`. Chat/completion call further down stays on the gateway. |

Also touch `supabase/functions/embed-srto-corpus/README.md` to note the embedding provider is now OpenAI direct (model + dim unchanged).

### 3. Things explicitly NOT changed

- All chat/completion calls to `ai.gateway.lovable.dev` (Wave 3 finding draft, Wave 4 #2 executive summary, Ask Viv response generation, etc.)
- `srto_corpus.embedding` column type (already `vector(1536)`)
- HNSW index on `srto_corpus`
- RLS policies, table schemas, view definitions
- SuperAdmin auth gate on the embed pipeline
- `compliance-assistant-client` and `vector-index-remove` (no embedding calls)

### 4. Validation criteria

After deploy:

1. `GET /embed-srto-corpus/health` → 200 with `ok: true`, real test embedding succeeded, `openai_reachable: true`.
2. Canary embed of one PDF from `srto-source-documents/srto_2025/` → > 0 rows in `srto_corpus` with valid 1536-dim vectors.
3. Wave 3 / Wave 4 #2 still produce drafts (gateway chat path unchanged, retrieval now populated).
4. Ask Viv (`compliance-assistant`) end-to-end: embed query → retrieve → gateway chat response.

### Technical notes

- Batch endpoint accepts up to ~2048 inputs per call; chunks per PDF stay well under that.
- Helper trims input and rejects empty strings before calling OpenAI.
- Errors propagate as thrown Error with status + body so existing try/catch in each function returns a clean 5xx with detail.
- No `deno.lock` changes — `fetch` is built-in.
