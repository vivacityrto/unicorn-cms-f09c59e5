

# AI-Powered ClickUp Task Search and Summarisation

## Overview
Add an AI chat bar to the ClickUp Activity section on the Tenant Detail page. Users can ask natural language questions about the tenant's ClickUp tasks and comments (e.g. "Summarise all open tasks", "What tasks mention evidence gaps?", "List overdue items"). The AI response can optionally be saved as a note to the tenant's main notes section.

## User Experience
1. Below the ClickUp Activity header, a collapsible AI search bar appears with an input field and "Ask" button
2. User types a question about the tenant's ClickUp data
3. The AI streams a markdown response based on the tenant's tasks and comments
4. A "Save as Note" button appears alongside the response, which inserts the AI summary into the `notes` table as a tenant note

## Architecture

### New Edge Function: `clickup-ai-search`
- Receives: `tenant_id`, `question`
- Authenticates user and verifies Vivacity staff access
- Fetches all tasks from `clickup_tasks_api` for the tenant (name, status, custom_id, date_created, time_estimate, time_spent, creator_username)
- Fetches all comments from `v_clickup_comments` for the tenant (task_id, comment_text, comment_date, comment_by)
- Builds a system prompt instructing the AI to answer questions about the ClickUp data
- Injects the task and comment data as context
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with streaming enabled
- Returns SSE stream to the client

### Frontend Changes

**New Component: `TenantClickUpAISearch.tsx`**
- Props: `tenantId: number`
- Input field with send button
- Streams AI response token-by-token using SSE parsing
- Renders response with `react-markdown`
- "Save as Note" button that inserts the AI response into `notes` table with `parent_type: 'tenant'` and a prefix like "[ClickUp AI Summary]"

**Modified: `TenantClickUpActivity.tsx`**
- Import and render `TenantClickUpAISearch` in the header area of the card, as a collapsible section

## Technical Details

### Edge Function (`supabase/functions/clickup-ai-search/index.ts`)
- CORS headers as per standard pattern
- Auth token verification via `supabase.auth.getUser()`
- Vivacity staff check using `is_vivacity_staff` or profile role check
- Fetches tasks (capped at 200) and comments (capped at 500) for the tenant
- System prompt: "You are an internal assistant for Vivacity Coaching. You have been given ClickUp task and comment data for a specific client. Answer the user's question based only on this data. Use Australian date formats. Be concise and factual."
- Streams response from Lovable AI Gateway
- Config: `verify_jwt = false` in config.toml

### Frontend Component (`src/components/tenant/TenantClickUpAISearch.tsx`)
- Uses `import.meta.env.VITE_SUPABASE_URL` for the streaming fetch URL
- SSE line-by-line parsing (same pattern as documented)
- Markdown rendering of the streamed response
- "Save as Note" button calls `supabase.from("notes").insert(...)` with the AI-generated content
- Loading state with spinner during streaming

### Config Update (`supabase/config.toml`)
- Add `[functions.clickup-ai-search]` with `verify_jwt = false`

## Files to Create/Modify
1. **Create** `supabase/functions/clickup-ai-search/index.ts` -- Edge function
2. **Create** `src/components/tenant/TenantClickUpAISearch.tsx` -- AI search UI
3. **Modify** `src/components/tenant/TenantClickUpActivity.tsx` -- Integrate AI search
4. **Modify** `supabase/config.toml` -- Register new edge function

## Security
- Vivacity staff only (consistent with existing ClickUp visibility rules)
- Uses `LOVABLE_API_KEY` (already configured) for AI Gateway
- No client-facing access
- Note insertion uses authenticated user's ID for audit trail
