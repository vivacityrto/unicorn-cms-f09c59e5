# Fix: `quality_area` does not exist on `compliance_template_questions`

## Scope (audit results)

I grepped all six AI functions for `quality_area`. Only **two** functions actually `SELECT quality_area` from `compliance_template_questions` — the others either reference it on `srto_corpus` (valid), only define it in TS interfaces, or read it from a JS object that just resolves to `undefined` without hitting SQL.

| Function | Status |
|---|---|
| `draft-finding` | **Broken** — selects `quality_area` from `compliance_template_questions` (line 392). |
| `analyse-evidence` | **Broken** — selects `quality_area` from `compliance_template_questions` (line 217). |
| `draft-executive-summary` | Safe — SELECT is `( clause )` only (line 265); JS mapping reads `quality_area` and silently gets `undefined`. No SQL error. Will clean up for consistency. |
| `embed-srto-corpus` | Safe — `quality_area` is on `srto_corpus`. Leave untouched. |
| `analyze-document` | Safe — only an optional TS interface field, never queried. Leave untouched. |
| `compliance-assistant` / `compliance-assistant-client` | Safe — no `quality_area` references at all. |

## Changes

### 1. `supabase/functions/draft-finding/index.ts`
- Line 392: remove `quality_area` from the `compliance_template_questions:question_id (...)` select list. New list: `clause, audit_statement, evidence_to_sight, corrective_action, unicorn_documents, response_set, flagged_responses`.
- Line 159: remove `quality_area` from the `AssembledContext` interface.
- Line 418: remove `quality_area: q.quality_area ?? null,` from the `ctx` assembly.
- Line 205: change the prompt header from `QUESTION (clause ${ctx.clause ?? 'n/a'}, ${ctx.quality_area ?? 'n/a'})` to `QUESTION (clause ${ctx.clause ?? 'n/a'})`. The `clause` already carries the standards-mapping signal the model needs; SRTO retrieval (which runs separately and is what actually grounds the draft) keeps its own `quality_area` filtering against `srto_corpus` unchanged.
- Improve the catch-all at line 400-401: log `respErr.message` at `console.error` level before returning the 404, so future PG errors surface in function logs instead of being buried in the response `detail`.

### 2. `supabase/functions/analyse-evidence/index.ts`
- Line 217: remove `quality_area` from the same select list. New list: `clause, audit_statement, evidence_to_sight, corrective_action, response_set, flagged_responses`.
- Line 299: change prompt header from `QUESTION (clause ${q.clause ?? 'n/a'}, ${q.quality_area ?? 'n/a'})` to `QUESTION (clause ${q.clause ?? 'n/a'})`.

### 3. `supabase/functions/draft-executive-summary/index.ts` (cleanup, non-functional)
- Line 146: remove `quality_area` from the `FindingRow` interface.
- Line 282: remove the `quality_area:` mapping line that always resolves to `undefined`.
- Line 426: drop the `QUALITY_AREA: ...` line from the prompt block (it's already always `n/a` today).

## Out of scope
- No schema changes to `compliance_template_questions`.
- No changes to `srto_corpus` or `audit_question_bank` — `quality_area` is valid on both.
- No changes to `embed-srto-corpus`, `analyze-document`, `compliance-assistant*`.

## Validation
Once deployed, this should return a structured AI draft (not a 500/404):
```bash
curl -X POST "https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/draft-finding" \
  -H "Authorization: Bearer <super-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"audit_id":"3b1fbbee-0c1d-4c9b-9b59-f2d6205ecbdd","response_id":"5ee3ed7f-0dbb-4a68-a5b4-a29e3720fe1f"}'
```
And `analyse-evidence` invocations against any response with linked documents will no longer 500.
