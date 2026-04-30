# Final plan — embedding namespace fix + retry hardening + Ask Viv smoke

## 1. Six embedding callsites → namespaced model name

Bare `text-embedding-3-small` → `openai/text-embedding-3-small`.

| File | Line(s) |
|---|---|
| `supabase/functions/retrieve-srto-context/index.ts` | 5 (comment), 25 (`EMBED_MODEL`) |
| `supabase/functions/embed-srto-corpus/index.ts` | 6 (comment), 24 (`EMBED_MODEL`) |
| `supabase/functions/vector-search/index.ts` | 202 |
| `supabase/functions/vector-index-update/index.ts` | 313 |
| `supabase/functions/vector-index-rebuild/index.ts` | 267 |
| `supabase/functions/compliance-assistant/index.ts` | 473 |

The `embedding.length !== 1536` guardrail in `retrieve-srto-context` stays as the primary defence against silent vector-space drift — same underlying OpenAI model regardless of prefix, but the guardrail is the contract.

## 2. Validator surfaces a parseable word count

`supabase/functions/draft-executive-summary/_validation.ts`:
- `findOverlongQuote` → returns `{ snippet: string; words: number } | null`.
- Reason string format: `quote exceeds 30 words (N words, M over): "<snippet>"` where `M = N - 30`.

## 3. Quote-aware corrective retry

`supabase/functions/draft-executive-summary/index.ts` retry block (~516–518):
- Match `validation.reason` against `/quote exceeds 30 words \((\d+) words, (\d+) over\)/`.
- On match, prepend:
  > Your previous response quoted a Standard for N words — M over the limit. Paraphrase the Standard's intent in your own words; do not reproduce more than 30 consecutive words from any Standard.
- On miss, fall through to the existing generic retry — graceful degradation.
- Keep the existing trailing guardrail (banned terms, finding-id integrity, no self-reference).

## 4. Round-trip parsing tests — both halves of the contract

Append to `supabase/functions/draft-executive-summary/validation_test.ts`:

**Positive** — overlong-quote reason exposes parseable N and M (N=35, M=5).

**Negative** — a non-quote failure (banned-term reason) does NOT match the quote-retry regex. This locks the contract so a future validator refactor can't silently route every failure into the quote-paraphrase prompt.

## 5. Verification

1. `supabase--test_edge_functions` filtered to `draft-executive-summary` — both new tests pass.
2. **Smart Education smoke**: re-run `draft-executive-summary` end-to-end. Expect `retrieve-srto-context` 200 with chunks (or `[]` if SRTO corpus not yet embedded — still passes the gateway check), draft validates first try, log row written, 200 to caller.
3. **Ask Viv smoke (hard requirement)**: from `AskVivPanel`, query *"What does SRTO 2025 say about validation requirements?"* — expect a citation of Standard 1.5 with paraphrased context. Generic compliance advice with no Standard citation = still broken; investigate before declaring done.

## 6. Rollback / contingency

If the `openai/` prefix is also rejected post-deploy:
1. **Read the gateway error response body first** — it typically lists accepted model names. The prefix may simply be different (e.g. `lovable/text-embedding-3-small`) rather than absent. One-line revert per file to try the alternate prefix.
2. Only if no namespaced form is accepted at all does the picture flip to "embedding support dropped from the gateway", at which point a direct OpenAI fallback would be in scope (out of scope here).

## Dependency note

The four non-roadmap functions touched (`vector-search`, `vector-index-update`, `vector-index-rebuild`, `compliance-assistant`) all power Ask Viv — confirmed via `AskVivPanel.tsx:327` (invokes `compliance-assistant`) and the shared `validateAskVivAccess` gating. `vector-index-remove` does not embed and is unaffected. The Ask Viv smoke in §5.3 is what proves the silent degradation is actually fixed.
