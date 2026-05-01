## Fix: draft-executive-summary 502 "response not an object"

### Root cause

`callModel()` in `draft-executive-summary/index.ts` (lines 474–509) currently sends only OpenAI-style `response_format: { type: 'json_object' }`. The Lovable AI Gateway routes to `google/gemini-2.5-pro`, which does not always honour the OpenAI flag and can return:

- JSON wrapped in ```` ```json ```` fences
- A natural-language preamble ("Here is the executive summary: …")
- Truncated JSON when the synthesis exceeds the implicit output token cap (17-finding rollup is large)

When `JSON.parse(content)` fails, the regex fallback `content.match(/\{[\s\S]*\}/)` either returns `null` or grabs a malformed slice, so `parsed` ends up as `null`. `validateDraft(null, …)` returns `response not an object`. The retry hits the same conditions and fails identically — hence the 134s wall clock and opaque 502.

The same `callModel` shape exists in `draft-finding/index.ts` (lines 486–522). It works today only because its outputs are smaller and luckier; one prompt growth away from the same bug.

`analyse-evidence/index.ts` (lines 316–357) has the same vulnerability in a thinner form: `JSON.parse(content)` with no normalisation and no fallback at all.

### Changes

**1. `supabase/functions/draft-executive-summary/index.ts`**

In the `callModel` body (line 485):
- Add Gemini-native structured-output hints alongside the existing OpenAI-style flag, so whichever the gateway forwards is honoured:
  ```ts
  body: JSON.stringify({
    model: MODEL,
    messages,
    response_format: { type: 'json_object' },
    generationConfig: {
      response_mime_type: 'application/json',
      max_output_tokens: 8192,
    },
  })
  ```
- Replace the inline `JSON.parse` + regex fallback with a shared `safeParse(raw)` helper (defined once near the top of the file):
  ```ts
  function safeParse(raw: string): unknown {
    let s = (raw ?? '').trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const firstStruct = s.search(/[{[]/);
    if (firstStruct > 0) s = s.slice(firstStruct);
    try { return JSON.parse(s); } catch { /* fall through */ }
    const m = s.match(/[{[][\s\S]*[}\]]/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* noop */ } }
    return null;
  }
  ```
- When `safeParse` returns `null` OR `data.choices?.[0]?.finish_reason === 'length'`, log `console.error('Gemini synthesis unparseable', { finish_reason, contentPreview: content.slice(0, 500), usage: data.usage })` before returning, so future failures are diagnosable from logs.

**2. `supabase/functions/draft-finding/index.ts`**

Apply the same three changes defensively in its `callModel` (lines 486–522): add `generationConfig` block, swap to the same `safeParse` helper (duplicated locally — these functions don't share a module), and log `finish_reason` + 500-char content preview when parsing fails. Existing retry/validation flow stays intact.

**3. `supabase/functions/analyse-evidence/index.ts`**

Quick parity hardening at lines 325–353:
- Add the `generationConfig` block to the request body.
- Replace `try { raw = JSON.parse(content); } catch { return json({ error: 'AI response was not valid JSON' }, 502); }` with the same `safeParse` helper plus a `console.error` of `finish_reason` and content preview before the 502.

No retry loop is added here — analyse-evidence intentionally fails fast and the user can re-run. The fix purely makes the parse forgiving and the failure observable.

### Out of scope (confirmed)

- Retrieval logic (`retrieve-srto-context`, clause filtering, threshold) — already correct from the prior plan.
- Prompt templates, system prompts, exemplars (`EXEMPLARS_PENDING` is Phase 1.3).
- `validateDraft` in `_validation.ts` — its contract is fine; the fix is upstream of it.
- `compliance-assistant` / `compliance-assistant-client` — different parsing path, not in scope.
- Model selection — staying on `google/gemini-2.5-pro`.

### Validation

After deploy, re-run:

```bash
curl -X POST "https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/draft-executive-summary" \
  -H "Authorization: Bearer <super-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"audit_id":"3b1fbbee-0c1d-4c9b-9b59-f2d6205ecbdd"}'
```

Expected: 200 with `executive_summary`, `overall_finding`, `risk_rationale`, `action_plan_rollup`, `confidence`, `uncertainty_notes` populated and persisted to `client_audit_log`. If Gemini still emits unparseable output, the edge function logs will now show `finish_reason` + the first 500 chars of the response, turning future failures from opaque 502s into a one-look diagnosis.

`draft-finding` and `analyse-evidence` should continue passing their existing flows; the changes are additive and defensive.
