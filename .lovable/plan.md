## Plan: Align AskVivPanel compliance flow with V4 edge function response

### Problem
`compliance-assistant` V4 returns only: `answer_markdown`, `records_accessed`, `confidence`, `gaps`, `chunks_used`, `source_types_used`, `reasoning_tiers`, `escalation_count`, `governance`, `validation`.

`AskVivPanel.tsx` still reads `explain`, `scope_lock`, `freshness`, `micro_explain`, and `ai_interaction_log_id` from the result and propagates them into the assistant `Message`. These fields are `undefined` and flow into child components.

### Fix (single file: `src/components/ask-viv/AskVivPanel.tsx`)

**1. `sendComplianceMessage()` return object — lines 324–334**

Replace with:
```ts
return {
  content: result.answer_markdown,
  records_accessed: result.records_accessed,
  confidence: result.confidence,
  gaps: result.gaps,
};
```
Removes: `explain`, `scope_lock`, `freshness`, `micro_explain`, `ai_interaction_log_id`.

**2. Compliance branch `assistantResponse` — lines 489–502**

Replace with:
```ts
assistantResponse = {
  id: "compliance-" + Date.now(),
  role: "assistant",
  content: result.content,
  records_accessed: result.records_accessed,
  confidence: result.confidence,
  gaps: result.gaps,
  created_at: new Date().toISOString(),
};
```
Removes the same five fields.

### Out of scope (explicitly unchanged)
- `Message` interface (lines 73–77) — fields remain optional; absence is valid.
- Edge function `supabase/functions/compliance-assistant/index.ts`.
- Child components: `AskVivScopeBanner`, `AskVivFreshnessChip`, `AskVivMicroExplain`, `AskVivExplainPanel`, `AskVivFlagButton`. Existing `&&` render guards (lines 748, 759, 766, 839, 844) already short-circuit on absent values.

### Expected outcome
Compliance-mode messages send/receive without crashing. Scope, freshness, explain, and flag UI will not render until V4 emits those fields — by design.

Approve to switch to default mode and apply.