

## Fix: Documents Not Loading on Stage Detail Page

### Root Cause
The console shows error `42703: column documents.created_at does not exist`. The actual column name in the `documents` table is `createdat` (no underscore). This causes the entire document query to fail, so zero documents appear.

This was introduced during the previous migration when `useStageTemplateContent.tsx` was rewritten to query `documents` directly — the select list used `created_at` instead of the actual column name `createdat`.

### Fix

**File: `src/hooks/useStageTemplateContent.tsx`**

1. **Line 123** — Change the document select from:
   ```
   'id, title, description, format, category, document_status, ai_status, ai_confidence_score, ai_category_confidence, ai_description_confidence, ai_reasoning, created_at, stage'
   ```
   to:
   ```
   'id, title, description, format, category, document_status, ai_status, ai_confidence_score, ai_category_confidence, ai_description_confidence, ai_reasoning, createdat, stage'
   ```

2. **Line 176** — Update the mapping from `d.created_at` to `d.createdat`

3. **Scan all other document select statements** in the same file (lines ~631, ~849) for the same `created_at` → `createdat` fix.

### Secondary errors visible in console (not blocking, but should fix)
- **`useStageAuditLog.tsx`**: Passing integer stage ID `1114` where a UUID is expected — needs a guard or skip for non-UUID IDs
- **`useStageActiveUsage.tsx`**: PostgREST can't find FK between `client_packages` and `tenants` — likely a join syntax issue

These are separate issues but worth noting.

