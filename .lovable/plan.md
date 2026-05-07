## Fix topic check constraint violation (23514)

The `tenant_conversations.topic` column only accepts: `general`, `support`, `csc`, `document_request`, `bot_escalation`. Two create paths currently pass the user's free-text subject into `topic`, triggering check constraint violations. Free-text already lives in the `subject` column on the next line, so `topic` should be hardcoded to `'general'`.

### Changes

**1. `src/hooks/useClientCommunications.ts`** — in the `createConversation` mutation insert payload:
- Replace `topic: subject || "General",` with `topic: "general",`

**2. `src/pages/TeamCommunicationsPage.tsx`** — in `NewTeamMessageDialog.handleSubmit` insert payload:
- Replace `topic: subject.trim() || "General",` with `topic: "general",`

### Out of scope
- No DB/RLS/schema changes
- No edits to the `subject` field or any surrounding logic
- No other files touched
