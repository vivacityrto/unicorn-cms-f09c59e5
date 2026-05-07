## Plan: Add all tenant users as conversation participants

**File**: `src/pages/TeamCommunicationsPage.tsx` (inside `NewTeamMessageDialog.handleSubmit`)

**Change**: Replace the primary-contact-only lookup + single upsert with a query that fetches all `tenant_users` for the tenant and bulk-upserts them into `conversation_participants` with `role: "client"`.

**Why**: RLS on `tenant_messages` requires the user to be in `conversation_participants`. Adding only the primary contact (often null) leaves client users unable to read messages — they see the conversation but get "No messages in this conversation yet."

**Exact replacement**: swap the `pc` block for the `tenantUsers` block as specified in the request, preserving the `onConflict: "conversation_id,user_id", ignoreDuplicates: true` upsert options.

**Out of scope**: no schema/RLS/migration changes; no other files touched; no edits to subject/topic logic.
