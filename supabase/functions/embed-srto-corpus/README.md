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
