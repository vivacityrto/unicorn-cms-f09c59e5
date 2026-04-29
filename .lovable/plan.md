# Restore `explain` payload in V4 compliance-assistant

## Background

`AskVivExplainPanel` expects an `ExplainPayload` on each compliance message and the toggle (`explainSourcesEnabled`) is already wired. The V4 edge function stopped returning `explain`, so the panel never renders. We need to construct it from data already computed in V4 and pass it through `AskVivPanel`.

## Important shape note

The user's prompt suggested a simplified `safety` shape (`{ phrase_filter: { applied, count }, banned_phrases_found, validation_passed }`). That does **not** match the panel — `AskVivExplainPanel` reads `explain.safety.phrase_filter.blocked` and `explain.safety.validator.ok/repaired`. We will use the canonical `ExplainSafety` shape (already defined in `_shared/ask-viv-prompts/explain-types.ts` and matched by the panel) and populate it from V4's `validationResult` and `sanitizeResponse` `modifications`. This delivers the user's intent (light up the panel) without breaking the existing UI.

## Edge function changes — `supabase/functions/compliance-assistant/index.ts`

1. Import the existing helper:
   ```ts
   import { buildExplainPayload, type ExplainPayload } from "../_shared/ask-viv-prompts/explain-types.ts";
   ```

2. Thread `validationResult` and `modifications` out of `generateFactBasedAnswer` so the main handler can build the explain payload. Two clean options — pick the smaller one:
   - Add them to the function's return object (e.g. `_validation_raw`, `_modifications`), or
   - Return a small `safetyMeta` field used only to build explain.

   Implementation: extend the return at line ~798 with `safety_meta: { validation: validationResult, modifications }`. Strip it before sending to the client (or just leave it — it is harmless metadata; safer to strip).

3. After `response = generateFactBasedAnswer(...)` and after `scope_lock` / `freshness` are derived (around line 360), build:
   ```ts
   const explain: ExplainPayload = buildExplainPayload(
     tenantId,
     {
       client_id: factsResult.context.scope.client_id,
       package_id: factsResult.context.scope.package_id,
       phase_id: factsResult.context.scope.phase_id,
     },
     profile.unicorn_role || "unknown",
     Array.from(new Set([
       ...factsResult.audit.tables_queried,
       ...(response.source_types_used ?? []),
     ])),
     response.records_accessed.map(r => ({
       table: r.table,
       id: String(r.id),
       label: r.label,
     })),
     factsResult.facts,            // helper builds safe previews
     factsResult.gaps,              // canonical gaps from fact builder
     null,                          // phraseFilterResult — not run separately in V4
     response.safety_meta?.validation ?? null,
     (response.safety_meta?.modifications?.length ?? 0) > 0,
   );
   ```

   `buildExplainPayload` already produces `facts_used` previews capped at 120 chars (the user asked for 80; 120 is the existing tested standard — keeping it avoids drift across the rest of the system).

4. Optionally attach `freshness` to `explain.freshness` (panel supports it), mapping the V4 `freshness` object to `{ last_activity_at, days_since_activity, status, confidence_downgraded: false }`.

5. Return shape (line 374) becomes:
   ```ts
   const { safety_meta, ...responseClean } = response;
   return jsonRaw({ ...responseClean, scope_lock, freshness, explain });
   ```

## Frontend changes — `src/components/ask-viv/AskVivPanel.tsx`

1. In `sendComplianceMessage` (lines 345–355), add:
   ```ts
   explain: result.explain ?? undefined,
   ```

2. In `sendMessage` compliance branch (lines 510–523), add:
   ```ts
   explain: result.explain,
   ```
   on the `assistantResponse` object.

The `Message.explain?: ExplainPayload` type is already declared (line 73), and the render block at lines 888–889 already conditionally mounts `<AskVivExplainPanel explain={message.explain} />` when `explainSourcesEnabled`.

## Out of scope

- No DB / RLS / migration changes.
- No changes to `AskVivExplainPanel`, `MicroExplainPanel`, or the `explainSourcesEnabled` toggle.
- No changes to the `safety` shape in the panel — we use the canonical shape.
- No new shared modules — reusing `buildExplainPayload` and `ExplainPayload` from `_shared/ask-viv-prompts/explain-types.ts`.

## Files touched

- `supabase/functions/compliance-assistant/index.ts` (imports, ~5 lines in answer return, ~15 lines in handler, modify final return)
- `src/components/ask-viv/AskVivPanel.tsx` (2 small additions)

## After approval

Deploy `compliance-assistant`, then verify in preview that the "Source Explanation (CSC Review)" panel renders under a compliance answer when the toggle is on.
