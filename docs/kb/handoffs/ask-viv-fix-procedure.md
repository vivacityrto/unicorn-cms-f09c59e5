# Ask Viv Fix — Lovable Prompt Procedure

> **Created:** 28 April 2026  
> **Completed:** 29 April 2026 — all prompts executed and verified  
> **Status:** Reference — keep for the next time Ask Viv breaks  
> **Trigger:** Ask Viv panel crashes or compliance-mode messages fail to render.

---

## Background: What broke and why

The `compliance-assistant` edge function was upgraded to **V4** (fact-builder architecture). V4's response shape changed. The frontend `AskVivPanel.tsx → sendComplianceMessage()` still expects V3 fields that V4 no longer returns.

| Field | V3 (old) | V4 (current) |
|---|---|---|
| `answer_markdown` | ✓ | ✓ |
| `records_accessed` | ✓ | ✓ |
| `confidence` | ✓ | ✓ |
| `gaps` | ✓ | ✓ |
| `explain` | ✓ returned | ✗ not in V4 |
| `scope_lock` | ✓ returned | ✗ not in V4 |
| `freshness` | ✓ returned | ✗ not in V4 |
| `micro_explain` | ✓ returned | ✗ not in V4 |
| `ai_interaction_log_id` | ✓ returned | ✗ not in V4 |

V4 does return these **new** fields (not yet used by the frontend):

- `chunks_used`, `source_types_used`, `reasoning_tiers`, `escalation_count`, `governance`, `validation`

The render guards in `AskVivPanel.tsx` (e.g. `message.scope_lock &&`) should prevent crashes from undefined values, but a render exception somewhere in the chain triggers the `ErrorBoundary` and crashes the whole dashboard.

**This fix involves no database migrations.** The Lovable production DB change procedure does not apply.

---

## What actually happened — 29 April 2026 session

Three bugs were discovered via DevTools before the numbered prompts ran. All were fixed via Lovable before Prompt 1.

**Bug A — `AskVivCapabilitiesBanner` page-load crash**  
`useAskViv` Zustand store persists `selectedMode` to localStorage. A prior session had saved `selectedMode: 'web'`. On reload, `modeConfig['web']` was `undefined` (the `web` key was missing from the object), causing `config.icon` to throw `TypeError: Cannot read properties of undefined`. Fix: added `web` entry to `modeConfig` with the `Globe` icon.

**Bug B — `ReferenceError: GLOBAL_SYSTEM_PROMPT is not defined` in edge function**  
`_shared/ask-viv-prompts/index.ts` used re-export syntax (`export { X } from './x.ts'`) for all prompt constants. Re-exports do not create local bindings in Deno; `buildPromptPack()` then used those names as local variables and threw at runtime. Fix: converted all three re-export blocks to import-then-export. Confirmed by `ai_interaction_logs` having zero compliance entries — the function had never completed since V4 deployed.

**Bug C — "Tenant Required" toast for Super Admin in compliance mode**  
`loadTenantContext()` in `AskVivPanel.tsx` queries `tenant_members` to resolve tenant context. Super Admins have no `tenant_members` rows, so the query returned nothing and the panel showed a "Tenant Required" error. Fix: added URL-based fallback — if `tenant_members` returns no rows, parse `/tenant/:id` from `location.pathname` and query the `tenants` table directly.

After Bugs A–C were resolved, Prompts 1–5 were executed in sequence and all verified in the live app on 29 April 2026.

---

## Pre-flight check (do this in Claude Code before prompting Lovable)

1. Open browser DevTools → Console while the error is showing. Copy the full stack trace. It identifies exactly which component throws.
2. Note which **mode** was selected (Knowledge / Compliance / Web) when the crash occurred.
3. Note whether the crash happens on **page load** (panel closed) or only **after opening the panel / sending a message**.

If the crash is only on compliance-mode message send → start at **Prompt 1**.  
If the crash is on page load regardless of panel state → start at **Prompt 0**.

---

## Prompt 0 — Page-load crash triage (use only if crash occurs before panel opens)

> Use this prompt if every dashboard page crashes immediately, before the user interacts with Ask Viv.

```
The Ask Viv panel (AskVivPanel.tsx) is always mounted inside DashboardLayout.tsx.
The app is showing an ErrorBoundary crash on every dashboard page, even before the
panel is opened (isOpen is false, so the full JSX is not rendered, but hooks and
imports still execute).

Please investigate:
1. Are all imports in AskVivPanel.tsx and its child components resolvable?
   Check: AskVivExplainPanel, AskVivScopeBanner, AskVivFreshnessChip,
   AskVivMicroExplain, AskVivFlagButton, AskVivModeSelector,
   AskVivCapabilitiesBanner, AskVivContextChips, AskVivExplainSourcesToggle,
   AskVivScopeSelectorModal — and any files they import.
2. Do any of these files have a top-level expression (outside a function/component)
   that could throw on module load?
3. Does src/assets/viv-icon.png exist at the path imported in AskVivPanel.tsx?

Fix any broken imports or missing assets. Do not change any component behaviour,
only resolve the module-load crash.
```

---

## Prompt 1 — Stabilise: align frontend with V4 compliance-assistant response

> **Always run this.** Fixes the core contract mismatch.

```
The compliance-assistant edge function was upgraded to V4. Its response shape has
changed. The frontend function sendComplianceMessage() in AskVivPanel.tsx still
destructures V3 fields that V4 no longer returns, causing undefined values to flow
into child components.

V4 response shape (supabase/functions/compliance-assistant/index.ts, lines 690–714):
  answer_markdown, records_accessed, confidence, gaps,
  chunks_used, source_types_used, reasoning_tiers,
  escalation_count, governance, validation

Fields the frontend currently tries to read but V4 does NOT return:
  explain, scope_lock, freshness, micro_explain, ai_interaction_log_id

Required changes:

1. In AskVivPanel.tsx → sendComplianceMessage() (around lines 322–334):
   Remove the destructuring of explain, scope_lock, freshness,
   micro_explain, ai_interaction_log_id from result.
   The return object should only include fields V4 actually returns:
   content (from result.answer_markdown), records_accessed, confidence, gaps.

2. In sendMessage() (around lines 488–502), when building the assistantResponse
   for compliance mode, remove the properties:
   explain, scope_lock, freshness, micro_explain, ai_interaction_log_id.

3. The render guards in the JSX already handle these being absent:
   - message.scope_lock && <AskVivScopeBanner ...>
   - message.freshness && <AskVivFreshnessChip ...>
   - message.micro_explain && <AskVivMicroExplain ...>
   - explainSourcesEnabled && message.explain && <AskVivExplainPanel ...>
   - message.scope_lock && context.tenant_id && <AskVivFlagButton ...>
   These will all be falsy and not render — that is correct and intentional.

4. Verify the Message interface (lines 65–81) still compiles cleanly with the
   fields remaining optional (they already are, so no change needed there).

After this change, compliance-mode messages should send and receive responses
without crashing. The scope, freshness, explain, and flag UI will simply not
appear until V4 implements those fields.

Do NOT change the edge function. Do NOT change the Message interface. Only
update sendComplianceMessage() and the compliance-mode assistantResponse
construction in sendMessage().
```

---

## Prompt 2 — Surface the V4 metadata the frontend currently ignores

> Run this after Prompt 1 succeeds and compliance chat is working.

```
The V4 compliance-assistant response now returns useful metadata that the frontend
does not yet display. Please add light display of the following to the compliance
message metadata section in AskVivPanel.tsx (the area that already shows confidence
and records accessed):

1. reasoning_tiers — if present and non-empty, show a small summary:
   e.g. "X reasoning tiers · Y critical findings"
   Use the existing muted-foreground / text-xs style. Collapse it inside the
   existing Collapsible pattern already used for records_accessed if you prefer.

2. governance.caution_banners — if present and non-empty string array, render
   each as a small amber warning chip above the message content bubble.
   Use the same amber/warning colour as the existing medium-confidence icon.

3. validation.sanitized — if true, add a small italic note in muted-foreground:
   "Response was automatically sanitised."

Keep all additions inside the existing
{message.role === "assistant" && isComplianceMode && (...)} block.
Match the existing text-xs muted-foreground styling throughout.
No new components needed — inline JSX is fine.
```

---

## Prompt 3 — Restore scope inference for V4 (optional, defer if not urgent)

> Run this only if the scope-lock confirmation flow is needed for compliance mode.
> This requires extending the V4 edge function to emit scope_lock and freshness.

```
The compliance-assistant V4 edge function no longer returns scope_lock or freshness
data. These were V3 features that allowed the frontend to show a scope confirmation
banner (AskVivScopeBanner) and a data-freshness chip (AskVivFreshnessChip).

Please restore these in V4:

In supabase/functions/compliance-assistant/index.ts:

1. scope_lock — After the fact-builder runs and scope is resolved, construct and
   return a scope_lock object matching the ScopeLock type the frontend expects:
   {
     client: { id: string, label: string, inferred: boolean },
     package: { id: string, label: string, inferred: boolean },
     phase: { id: string, label: string, inferred: boolean },
   }
   Use the resolved client_id, package_id, phase_id from the request context.
   Mark inferred: true for any IDs that were resolved by scope inference
   (not explicitly passed in the request body).
   Return null for scope_lock if no client scope was resolved.

2. freshness — Query the most recent activity timestamp for the resolved client/
   package combination and return:
   {
     last_activity_at: string | null,
     days_since_activity: number | null,
     status: "fresh" | "aging" | "stale",
     derived_at: string,
   }
   Thresholds: ≤14 days = fresh, 15–30 = aging, >30 = stale.
   Derive this from the existing fact-builder data if available; otherwise a
   lightweight DB query is acceptable.

3. Add scope_lock and freshness to the final return object at line 690.

In AskVivPanel.tsx:

4. Re-add scope_lock and freshness to the sendComplianceMessage() return
   (reversing Prompt 1 step 1 for just these two fields).

5. Re-add scope_lock and freshness to the compliance assistantResponse
   construction (reversing Prompt 1 step 2 for just these two fields).

Do NOT modify AskVivScopeBanner or AskVivFreshnessChip — they are already
implemented correctly for the expected data shape.
```

---

## Prompt 4 — Restore explain panel for V4 (optional, defer if not urgent)

> Run this only if the "explain sources" transparency panel is needed.
> Depends on Prompt 3 being done first (scope context available).

```
The V4 compliance-assistant no longer returns an explain payload. The frontend
AskVivExplainPanel component expects ExplainPayload (from AskVivExplainPanel.tsx):
- context: { tenant_id, scope, role, derived_at }
- records_used: ExplainRecordRef[]
- facts_preview: FactPreview[]
- tables_queried: string[]
- gaps: string[]
- safety: ExplainSafety

Please construct and return an explain payload from V4's existing data:

In supabase/functions/compliance-assistant/index.ts, after the main logic:

1. Build an ExplainPayload from data already computed:
   - context: from the validated auth context (tenant_id, role, scope IDs)
   - records_used: from the records array (already built)
   - facts_preview: from factsResult.facts — map each fact to
     { key, value_preview (first 80 chars of value), source_table, source_ids_count }
   - tables_queried: from sourceTypesUsed
   - gaps: already computed
   - safety: from the sanitizeResponse result
     { phrase_filter: { applied: modifications.length > 0, count: modifications.length },
       banned_phrases_found: modifications,
       validation_passed: validationResult.valid }

2. Add explain to the final return object.

In AskVivPanel.tsx:
3. Re-add explain to sendComplianceMessage() return and the compliance
   assistantResponse construction.

The AskVivExplainPanel component and the explainSourcesEnabled toggle are already
wired — they will light up automatically once explain is in the response.
```

---

## Prompt 5 — Restore flag-for-review button (optional, defer if not urgent)

> Restores the AskVivFlagButton. Requires the ai_interaction_logs table.

```
The flag-for-CSC-review button (AskVivFlagButton) requires an ai_interaction_log_id
from the compliance-assistant response. V4 does not write to ai_interaction_logs.

Please add audit logging back to V4:

In supabase/functions/compliance-assistant/index.ts:

1. After building the final response, insert a row into ai_interaction_logs:
   {
     user_id: authContext.userId,
     tenant_id: resolvedTenantId,
     mode: "compliance",
     prompt_text: question,
     response_text: sanitized (answer_markdown),
     records_accessed: records,
     request_context: { client_id, package_id, phase_id, confidence, gaps },
   }
   Use the service client (createServiceClient()) to bypass RLS for the insert.
   Capture the returned id.

2. Add ai_interaction_log_id (the inserted row's id, or null on insert failure)
   to the final return object.

In AskVivPanel.tsx:
3. Re-add ai_interaction_log_id to sendComplianceMessage() return and the
   compliance assistantResponse construction.

The AskVivFlagButton is already implemented and will render automatically when
scope_lock and ai_interaction_log_id are both non-null.
Note: scope_lock must be restored (Prompt 3) for the flag button to appear,
since its render guard is: {message.scope_lock && context.tenant_id && <AskVivFlagButton ...>}.
```

---

## Verification checklist (after running prompts)

Run these manually in the app after each prompt:

- [ ] Every dashboard page loads without an error boundary crash
- [ ] Ask Viv panel opens without error
- [ ] Knowledge mode: send a question, response renders, sources collapsible works
- [ ] Compliance mode: send a question, response renders with confidence badge and records-accessed collapsible
- [ ] Compliance mode: confidence "low" / "medium" / "high" icons all render correctly
- [ ] Compliance mode: gaps list renders when present
- [ ] (After Prompt 2) reasoning_tiers summary appears on compliance responses
- [ ] (After Prompt 2) caution_banners render as amber chips when present
- [ ] (After Prompt 3) scope lock banner appears for responses with resolved client scope
- [ ] (After Prompt 3) freshness chip appears for aging/stale scopes
- [ ] (After Prompt 4) "Explain sources" toggle shows explain panel for SuperAdmin
- [ ] (After Prompt 5) Flag button appears on scoped compliance responses

---

## Notes for Claude Code when reviewing Lovable output

- Lovable works in `unicorn-cms-f09c59e5/` — do not commit or push there; it is Lovable's territory.
- After Lovable makes changes, run `git fetch` in `unicorn-cms-f09c59e5/` to see what landed.
- If Lovable adds a migration unexpectedly, stop and follow `handoffs/lovable-production-db-change.md`.
- The `AskVivPanel.tsx` file is ~900 lines — Lovable may time out or split changes across multiple responses. Review each diff carefully.
