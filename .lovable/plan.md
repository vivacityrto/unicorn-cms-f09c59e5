## Fix: Add user_type check to two edge functions

### Problem
Both `generate-release-documents` and `export-compliance-pack` check `unicorn_role` for `['Super Admin', 'Admin']` but do not verify `user_type`. This allows a Client Admin (`unicorn_role = 'Admin'`, `user_type = 'Client Parent'`) to invoke them.

### Changes

#### 1. `supabase/functions/generate-release-documents/index.ts`
- Expand the `.select("unicorn_role")` on line 149 to `.select("unicorn_role, user_type")`.
- Immediately after the existing role check (line 153), add:
  ```typescript
  if (!['Vivacity', 'Vivacity Team'].includes(userData.user_type)) {
    return new Response(
      JSON.stringify({ ok: false, code: 'FORBIDDEN', detail: 'Vivacity staff only' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  ```

#### 2. `supabase/functions/export-compliance-pack/index.ts`
- Expand the `.select("unicorn_role, first_name, last_name")` on line 57 to `.select("unicorn_role, user_type, first_name, last_name")`.
- Immediately after the existing role check (line 61), add the same `user_type` block as above.

### No other changes
All existing logic, error handling, audit logging, ZIP generation, and DOCX/XLSX processing remains untouched.

### Deployment
Both edge functions will be deployed automatically after the edits.