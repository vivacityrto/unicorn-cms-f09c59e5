## Fix: Primary contact ordering in email edge functions

### Problem
`send-email-graph` and `send-composed-email` pick the oldest `primary_contact` for a tenant (`created_at ASC`), while `bulk-send-invitations` already uses `DESC`. Tenants with contact changes receive emails to the wrong person.

### Changes
1. **`supabase/functions/send-email-graph/index.ts`** (line 191)  
   Change `.order("created_at", { ascending: true })` to `.order("created_at", { ascending: false })`

2. **`supabase/functions/send-composed-email/index.ts`** (line 86)  
   Change `.order("created_at", { ascending: true })` to `.order("created_at", { ascending: false })`

### What stays unchanged
- No other queries, columns, limits, or logic in either function are touched.
- `bulk-send-invitations` is not modified.
- No database migration.
- No RLS or schema changes.

### Deployment
Deploy both edge functions after the edits.
