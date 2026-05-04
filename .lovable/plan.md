I found two concrete causes on the Admin Stage Detail page:

1. Stage field edits are wired to `onChange`, so every keystroke immediately calls the database. Because the stage is shared/active, the live-stage confirmation flow intercepts the first keystroke, creating confusing partial saves and success messages instead of one predictable save.
2. Several child-content actions write an `audit_events` row with `entity_id = stageId.toString()`. The database now enforces `audit_events.entity_id` as UUID, so audit writes like `"1064"` fail. Some handlers await that failed audit insert after the main mutation, which can make the action look inconsistent and also explains the console error: `invalid input syntax for type uuid: "1064"`.

Plan:

1. Make Stage Settings edits explicit and predictable
   - Replace the instant-save `onChange` behaviour for stage name, stage type, description, short name, video URL, version label, and AI hint with local draft state.
   - Add a clear `Save Stage Settings` button.
   - Only show the live-stage confirmation once, when saving the full draft, not on every keystroke.
   - After save, refetch the stage from the database and update the local UI from the confirmed persisted row.
   - Show a destructive toast if the update fails or affects 0 rows, rather than a success toast.

2. Fix child task/email/document operations so audit logging cannot break them
   - Update `useStageTemplateContent` so staff task, client task, email, and document link/unlink operations do not write numeric stage IDs into strict UUID `audit_events.entity_id`.
   - For now, make those audit writes non-blocking and UUID-safe, with the numeric stage ID stored inside `details.stage_id` instead.
   - This preserves audit context without causing `invalid input syntax for type uuid: "1064"`.

3. Add missing RLS permissions for SuperAdmin stage child content
   - Add/repair policies for `client_tasks` so SuperAdmins can insert/update/delete stage template client tasks, not only read them.
   - Replace legacy `staff_tasks` policies that use `is_superadmin()` with the current `is_super_admin_safe(auth.uid())`, because Dave’s current role is `unicorn_role = 'Super Admin'` and `global_role` is null.
   - Ensure `emails` stage-template CRUD remains available to SuperAdmins using the current safe role function.
   - Keep tenant-facing SELECT policies intact.

4. Fix audit log display for numeric stage IDs
   - Stop querying `audit_events.entity_id = '1064'` on the stage audit tab, because that column is UUID and will always error for numeric stage IDs.
   - Query stage-related audit rows via `details.stage_id = 1064` going forward.
   - This removes the current console error and makes the audit tab compatible with bigint/integer stage IDs.

5. Clean up the active-usage lookup error
   - Fix `useStageActiveUsage` so it no longer asks Supabase for a non-existent `client_packages -> tenants` relationship.
   - Use the existing package/stage/tenant tables in separate safe queries instead.
   - This will restore the active-client warning so edits to live stages are guarded correctly.

6. Verification
   - Test editing stage name/description/short name and confirm refresh preserves the change.
   - Test deleting a staff task, email, and unlinking a document from the stage and confirm the item disappears after refresh.
   - Confirm the browser console no longer shows the `client_packages` relationship error or `invalid input syntax for type uuid: "1064"` from the stage page.