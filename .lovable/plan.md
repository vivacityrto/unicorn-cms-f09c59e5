## Fix: tenant_conversations topic check-constraint violation

### Problem
`src/hooks/useClientCommunications.ts` line 230 assigns the free-text `subject` string to the `topic` column. `tenant_conversations.topic` has a CHECK constraint allowing only: `general`, `support`, `csc`, `document_request`, `bot_escalation`. Any user-entered subject that isn't one of those values triggers Postgres error 23514, causing "New conversation" to fail from the client inbox.

### Change
One line, in the `createConversation` mutation insert:

```ts
// Before (line 230)
topic: subject || "General",

// After
topic: "general",
```

The user's subject text is already preserved on line 232 (`subject: subject || null`), so no data is lost.

### Why this is safe
- Single-line, isolated edit; no schema changes.
- `"general"` is a valid enum value, matching the existing default semantic.
- `subject` column continues to carry the free-text label for display.
- No RLS, FK, view, hook, or component contract changes.
- No impact on existing conversations (only affects new inserts).
- Future enhancement (not in this change): if/when we want users to pick a topic category, surface a typed selector in `NewConversationDialog` and pass it through — out of scope here.

### Risk
Minimal. Reverts a regression to the documented constraint contract. No migration, no downstream consumers affected.
