## Goal

Two small fixes to SRTO retrieval so downstream consumers (Ask Viv, Wave 3 finding draft, Wave 4 #2 exec summary) work without having to pass overrides:

1. Default similarity threshold drops from `0.7` → `0.5`.
2. `chunk_index` is actually returned from `match_srto_chunks` (currently the RPC doesn't select it, so any consumer reading `result.chunk_index` gets `undefined`).

## Changes

### 1. `supabase/functions/retrieve-srto-context/index.ts`

- Introduce a named constant `const DEFAULT_THRESHOLD = 0.5;` at module top (alongside the existing validation sets) and use it in place of the inline `0.7`.
- Update the JSDoc header comment to read `threshold?: number (0..1, default 0.5)`.
- No change to the validation range (still `0..1`) or to the override behaviour — explicit overrides still win.

### 2. New migration: extend `match_srto_chunks` to return `chunk_index`

Add a migration `supabase/migrations/<ts>_match_srto_chunks_return_chunk_index.sql` that:

- `drop function if exists public.match_srto_chunks(vector, float, integer, public.srto_source_type, text, text);`
- `create or replace function public.match_srto_chunks(...)` with the **same signature and body**, but the `returns table (...)` list gains `chunk_index integer` (placed right after `id`), and the `select` adds `c.chunk_index`.
- Re-add the existing `comment on function` line.
- Re-run the existing smoke check at the bottom of the prior migration (zero-vector probe across each framework) to confirm the function still resolves.

`srto_corpus.chunk_index` already exists (`integer not null`) per `20260429073239_*.sql`, so no table change is needed.

### 3. Generated types

`src/integrations/supabase/types.ts` will regenerate to include `chunk_index: number` on the `match_srto_chunks` Returns row. No hand edits — left to the standard regeneration step.

## Out of scope

- No change to `embed-srto-corpus`, `compliance-assistant`, or `compliance-assistant-client`. They don't currently read `chunk_index`; this just makes the field available so Wave 3/4 consumers can cite chunks precisely.
- No change to the threshold validation bounds, RLS, or the `security invoker` posture of the RPC.

## Verification

- After deploy, `supabase.rpc('match_srto_chunks', { query_embedding, match_threshold: 0.5, match_count: 1, ... })` returns rows that include a numeric `chunk_index`.
- Calling `retrieve-srto-context` with no `threshold` in the body returns `threshold: 0.5` in the response envelope.
- Existing callers passing an explicit `threshold` are unaffected.
