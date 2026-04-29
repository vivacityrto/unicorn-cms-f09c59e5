# Restore `ai_interaction_log_id` for AskVivFlagButton

## Background

`AskVivFlagButton` needs an `ai_interaction_log_id` plus `scope_lock` to render. V4 already calls `logInteraction()` (line 406 of `compliance-assistant/index.ts`) which inserts into `ai_interaction_logs`, but the function returns `void` so the row id is lost and never sent to the client.

Service-client access is already in place (`const supabase = createServiceClient();` at line 153) — no new client needed.

## Edge function — `supabase/functions/compliance-assistant/index.ts`

1. Change `logInteraction` signature from `Promise<void>` to `Promise<string | null>` and chain `.select("id").single()` on the existing insert. Return the id (or `null` on failure). Keep it non-blocking — any error is swallowed and returns `null`.

2. In the handler (line 406), capture the result:
   ```ts
   const aiInteractionLogId = await logInteraction(...);
   ```

3. Include it in the final return (line 420):
   ```ts
   return jsonRaw({
     ...responseClean,
     scope_lock,
     freshness,
     explain,
     ai_interaction_log_id: aiInteractionLogId,
   });
   ```

## Frontend — `src/components/ask-viv/AskVivPanel.tsx`

4. In `sendComplianceMessage` return, add:
   ```ts
   ai_interaction_log_id: result.ai_interaction_log_id ?? null,
   ```

5. In the `sendMessage` compliance branch `assistantResponse`, add:
   ```ts
   ai_interaction_log_id: result.ai_interaction_log_id,
   ```

The `Message.ai_interaction_log_id?: string | null` type and the `AskVivFlagButton` render guard (`message.scope_lock && context.tenant_id && ...` at ~line 898) are already wired.

## Out of scope

- Schema, RLS, or migrations on `ai_interaction_logs`
- `AskVivFlagButton` component itself
- Other modes (knowledge / web)
