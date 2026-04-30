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
  "model": "openai/text-embedding-3-small",
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

## National Code 2018 sources (CRICOS framework)

Each chunk in `srto_corpus` carries a `framework` value (`SRTO_2025`,
`NATIONAL_CODE_2018`, or `ESOS_ACT_2000`) so AI features routing CRICOS audits
get the right corpus. Path-prefix → framework mapping:

| Folder                      | source_type              | framework            |
|-----------------------------|--------------------------|----------------------|
| `national_code/`            | `national_code`          | `NATIONAL_CODE_2018` |
| `cricos_practice_guide/`    | `cricos_practice_guide`  | `NATIONAL_CODE_2018` |
| `esos_act/` (optional, v2)  | `esos_act`               | `ESOS_ACT_2000`      |

### Minimum CRICOS corpus

1. **`national_code/National_Code_2018.pdf`** — single legislative instrument
   from the Department of Education. Clean structure; embed first as the
   National Code canary.
2. **`cricos_practice_guide/`** — current ASQA and TEQSA CRICOS practice
   guides. Source the latest set from the regulator websites.

### Canary check for National Code

After embedding `National_Code_2018.pdf`, run:

```sql
select clause, quality_area, heading, left(content, 120) as preview
from srto_corpus
where framework = 'NATIONAL_CODE_2018'
order by clause nulls last
limit 30;
```

**Watch for**: clauses such as Standard 7 transfer obligations should resolve
to `quality_area = 'Transfer Between Registered Providers'`. If most
Standard 7 chunks have `clause IS NULL`, the National Code uses bare-Standard
references ("Standard 7", "NC 7") that the existing `\d+\.\d+` regex does not
match. Cosine retrieval still works (similarity finds the right chunks), but
clause-filtered routing in `match_srto_chunks` will be weaker. Surface the
miss rate before declaring the canary clean — extending the regex is a
follow-up if needed, not a blocker for v1.

### ESOS Act

Reserved path prefix only. Do not embed unless retrieval quality on Standard 8
(visa requirements) is poor without it.


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
