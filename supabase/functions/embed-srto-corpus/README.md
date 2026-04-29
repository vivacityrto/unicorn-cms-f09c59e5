# embed-srto-corpus

Admin-only edge function that embeds the **Standards for RTOs 2025** regulatory
corpus into `public.srto_corpus` for semantic retrieval by audit-AI features.

## Authorisation

- Caller must present a valid Supabase JWT (`Authorization: Bearer <jwt>`).
- The function verifies the caller has `users.unicorn_role = 'Super Admin'`.
- DB writes use the service role key (bypasses RLS).

## Input (all optional)

```json
{
  "source_document": "F2025L00354",      // optional filter, matches filename without .pdf
  "source_type": "outcome_standards",    // optional filter (enum)
  "force_reembed": false                  // if true, deletes existing chunks for matched docs first
}
```

## Health check (no DB writes, no embed run)

Use this **before** any real embed run to confirm the Lovable AI Gateway has
credits, the API key is valid, and the embedding shape matches what the corpus
expects. The auth gate is identical to the main path — Authorization is parsed,
the user is resolved, and `unicorn_role = 'Super Admin'` is enforced **before**
the health branch executes. The health endpoint is strictly more restrictive
than the main embed path, never weaker.

The function accepts **either** trigger. The path suffix is the more reliable
one because some `supabase functions invoke` versions strip custom headers:

**Path suffix (preferred):**
```bash
curl -X POST \
  "$SUPABASE_URL/functions/v1/embed-srto-corpus/health" \
  -H "Authorization: Bearer $SUPER_ADMIN_JWT"
```

**Header trigger (fallback):**
```bash
supabase functions invoke embed-srto-corpus \
  --method POST \
  --header 'x-srto-health: 1' \
  --body '{}'
```

Successful response:
```json
{
  "ok": true,
  "gateway": "lovable",
  "model": "text-embedding-3-small",
  "embedding_dims": 1536,
  "expected_dims": 1536,
  "dims_match": true,
  "latency_ms": 312
}
```

If the gateway returns **402**, the response is
`{ "ok": false, "error": "Lovable AI Gateway out of credits. Top up before invoking embed." }`.
Top up before proceeding — embedding 22 PDFs mid-run on an empty wallet is the
failure mode this check exists to prevent.

## Canary embed before full corpus run

After health check passes, embed **two** documents only and spot-check the
chunks before uploading the rest:

1. **`practice_guide/Practice_Guide__Assessment.pdf`** — structurally complex
   layout, and assessment is the most-audited Quality Area. This is the
   worst-case for the chunker and the right doc to validate against.
2. **`outcome_standards/F2025L00354.pdf`** — clean, structured standards
   text. Validates clause detection (1.1, 1.2, …) and quality-area mapping.

Then inspect:

```sql
select source_document, clause, quality_area, heading,
       left(content, 120) as preview
from srto_corpus
where source_document in ('Practice_Guide__Assessment', 'F2025L00354')
order by source_document, clause;
```

Only proceed to embed the remaining 20 PDFs once the canary looks clean.

## Operations

### 1. Initial seed

1. Upload each source PDF to the `srto-source-documents` Storage bucket via the
   Supabase dashboard, organised by source-type folder:
   - `outcome_standards/F2025L00354.pdf`
   - `compliance_requirements/F2025L00355REC01.pdf`
   - `credential_policy/Credential_Policy.pdf`
   - `practice_guide/Practice_Guide__Assessment.pdf` (and the other 17 guides)
2. Trigger the embed (Super Admin JWT in the Authorization header):
   ```bash
   supabase functions invoke embed-srto-corpus --body '{}'
   ```
3. Spot-check:
   ```sql
   select source_type, count(*) from srto_corpus group by 1;
   ```

### 2. Re-embed one document after replacement

```bash
supabase functions invoke embed-srto-corpus \
  --body '{"source_document":"F2025L00354","force_reembed":true}'
```

### 3. Re-embed everything after a model upgrade

1. Update `EMBED_MODEL` / `EMBED_DIMS` constants in `index.ts`.
2. Migration to alter `embedding` dimension if needed (drop and recreate the HNSW index).
3. Invoke with `{"force_reembed": true}`.

## Idempotency

Each chunk is keyed on `(source_document, chunk_index, content_hash)`. Re-running
without `force_reembed` skips chunks whose hash is already present. The response
reports `chunks_inserted`, `chunks_skipped`, and `chunks_deleted`.

## Costs

Re-embedding the full corpus (~80,000 tokens) costs roughly **AUD $0.003** via
the Lovable AI Gateway with `text-embedding-3-small`.

## Secrets used

- `LOVABLE_API_KEY` — embedding gateway (auto-provisioned).
- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` — auto-provisioned.

No `OPENAI_API_KEY` is required — the Lovable AI Gateway is OpenAI-compatible.
