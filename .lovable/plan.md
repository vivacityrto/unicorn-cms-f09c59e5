# Migrate Ask Viv to srto_corpus

## Goal

Both `compliance-assistant` and `compliance-assistant-client` currently call `search_vector_embeddings` against `vector_embeddings` (0 rows → ungrounded answers). Re-point them at `match_srto_chunks` over `srto_corpus` (24 docs / 121 chunks), matching the pattern used by `retrieve-srto-context`, `draft-finding`, and `draft-executive-summary`.

No DB changes. No RLS changes. `match_srto_chunks` is security-invoker; the existing user-JWT supabase client is already passed into `performVectorSearch`, so RLS is preserved.

## Files

- `supabase/functions/compliance-assistant/index.ts`
- `supabase/functions/compliance-assistant-client/index.ts`

## Changes per file

Both functions have an almost-identical `performVectorSearch(supabase, tenantId, query)` helper and a local `VectorResult` interface. Changes mirror across both.

### 1. Swap the RPC call

`compliance-assistant/index.ts` lines 474–485 and `compliance-assistant-client/index.ts` lines 402–409.

Replace the `supabase.rpc("search_vector_embeddings", { p_tenant_id, p_query_embedding, p_mode, p_source_types, p_limit, p_similarity_threshold })` call with:

```ts
const { data: results, error } = await supabase.rpc("match_srto_chunks", {
  query_embedding: queryEmbedding,
  match_threshold: 0.5,
  match_count: 6,
  filter_source_type: null,
  filter_framework: null,
  filter_clause: null,
});
```

`tenantId` is no longer passed — the corpus is global reference content, not tenant-scoped. Keep the parameter on `performVectorSearch` for now (caller signature stays stable); add a `// tenantId unused for srto_corpus` comment.

### 2. Update VectorResult shape and result mapping

Replace the interface in both files:

```ts
interface VectorResult {
  id: string;
  source_type: string;        // outcome_standards | compliance_requirements | credential_policy | practice_guide | national_code | cricos_practice_guide | esos_act
  source_document: string;    // e.g. "Practice Guide - Assessment"
  framework: string;          // SRTO_2025 | NATIONAL_CODE_2018 | ESOS_ACT_2000
  clause: string | null;      // e.g. "1.5"
  chunk_index: number;
  heading: string | null;
  content: string;
  similarity: number;
}
```

Replace the `.map((r) => ({...}))` block to read the new fields (drop `record_id`, `record_label`, `chunk_text`, `metadata`).

### 3. Update every downstream consumer of VectorResult

Both files use `record_label` and `chunk_text` to format the AI prompt and to build `records_accessed`. Replace with a single citation-label helper:

```ts
function citationLabel(vr: VectorResult): string {
  return vr.clause
    ? `${vr.source_document}, clause ${vr.clause}`
    : `${vr.source_document}, chunk ${vr.chunk_index}`;
}
```

Touch points:

- `compliance-assistant/index.ts` lines 624–642 and 975–991 (the two "Relevant Context (indexed)" prompt-builders): use `citationLabel(r)` in place of `r.record_label`, and `r.content` in place of `r.chunk_text`.
- `compliance-assistant/index.ts` lines 791–798 and 1091–1098 (records_accessed): set `table: vr.source_type`, `id: vr.id`, `label: citationLabel(vr)`.
- `compliance-assistant/index.ts` line 833 + `compliance-assistant-client/index.ts` line 360 (`source_types_used`): no change — `source_type` field still exists, values just come from the new enum.
- `compliance-assistant-client/index.ts` lines 615–617 ("Related material found"): use `citationLabel(top)`.

### 4. Update system-prompt citation guidance

Both functions feed retrieval into a Gemini prompt (compliance-assistant via the tier-prompt system in `_shared/ask-viv-prompts/`, compliance-assistant-client via its inline prompt builder). Wherever the prompt instructs the model to cite sources, insert:

> When citing sources, use `[<source_document>, clause <clause>]` for chunks with a clause; otherwise `[<source_document>, chunk <chunk_index>]`. Example: "...validation of assessment is required quarterly [Practice Guide - Assessment, clause 1.5]."

I'll grep `_shared/ask-viv-prompts/` for the existing citation instruction and update it in one place; the inline prompt in `compliance-assistant-client/index.ts` will be updated directly.

### 5. Add QUOTATION CONVENTIONS — STRICT block

Copy the block verbatim from `supabase/functions/draft-finding/index.ts` lines 128–132 into the system prompts of both Ask Viv functions (in `_shared/ask-viv-prompts/` for the internal variant, inline for the client variant).

### 6. JSON output / safeParse / generationConfig

Out of scope. Both Ask Viv functions stream conversational replies, not structured JSON drafts. The QUOTATION CONVENTIONS apply but the structured-output parsing pattern from Wave 3/4 does not. Per the user's note: "the JSON parsing changes don't" apply if the function isn't structured.

### 7. Diagnostic envelope

Both functions already expose `chunks_used` and `source_types_used` in their response — these will populate correctly from the new mapping. No new fields needed.

## What we are NOT touching

- `vector_embeddings` table — leave for Phase 3 cleanup.
- `search_vector_embeddings` RPC — leave for Phase 3 cleanup.
- `srto_corpus` schema, RLS, indexes, embeddings — already validated by Wave 3/4.
- `match_srto_chunks` RPC — already correct.
- Other callers of `search_vector_embeddings` (`vector-search`, `analyse-evidence`, `vector-index-update`, `vector-index-remove`, `vector-index-rebuild`) — those touch the indexing pipeline, not Ask Viv retrieval, and are out of scope per the brief.

## Validation after deploy

Ask Viv query: *"What does SRTO 2025 say about validation of assessment?"*

Expect:
- Substantive grounded answer.
- Citation in the form `[Practice Guide - Assessment, clause 1.5]` (or similar).
- `chunks_used > 0` and `source_types_used` populated in the response envelope.
- Edge function logs show `match_srto_chunks` returning 4–6 rows with similarity ≥ 0.5.
