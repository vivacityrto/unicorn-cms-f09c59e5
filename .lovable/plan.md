# Migration B (FINAL) — Academy User lockdown

23 RESTRICTIVE deny policies. Helper function. accept_invitation_v2 patch. 1-row backfill. Single transaction.

## Full SQL

```sql
BEGIN;

-- ============================================================
-- 1. Helper function
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_academy_only_user(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = _uid
      AND unicorn_role = 'Academy User'::public.unicorn_role
  );
$$;

REVOKE ALL ON FUNCTION public.is_academy_only_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_academy_only_user(uuid) TO authenticated, anon, service_role;

-- ============================================================
-- 2. accept_invitation_v2 — full body re-emitted, single line edit
--    Line changed: v_resolved_unicorn_role in 'academy_user' branch
--    'User' -> 'Academy User'. Every other line preserved verbatim.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_invitation_v2(p_token_hash text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invitation record;
  v_tu_role text;
  v_primary boolean;
  v_user_type public.user_type_enum;
  v_existing_uuid uuid;
  v_existing_accepted boolean;
  v_relationship_role public.tenant_user_role;
  v_resolved_unicorn_role public.unicorn_role;
BEGIN
  IF p_token_hash IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PARAMS', 'message', 'Missing required parameters');
  END IF;

  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token_hash = p_token_hash
    AND status = 'pending';

  IF v_invitation IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_invitations
      WHERE token_hash = p_token_hash AND status IN ('accepted', 'successful')
    ) INTO v_existing_accepted;

    IF v_existing_accepted THEN
      RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_ACCEPTED', 'message', 'Invitation already accepted');
    END IF;

    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TOKEN', 'message', 'Invalid or expired invitation token');
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.user_invitations
       SET status = 'expired', updated_at = now()
     WHERE id = v_invitation.id;

    RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED', 'message', 'This invitation has expired');
  END IF;

  IF v_invitation.relationship_role IS NOT NULL THEN
    v_relationship_role := v_invitation.relationship_role;

    CASE v_relationship_role
      WHEN 'primary_contact', 'secondary_contact' THEN
        v_tu_role := 'parent';
        v_primary := (v_relationship_role = 'primary_contact');
        v_user_type := 'Client Parent';
        v_resolved_unicorn_role := 'Admin';
      WHEN 'user' THEN
        v_tu_role := 'child';
        v_primary := false;
        v_user_type := 'Client Child';
        v_resolved_unicorn_role := 'User';
      WHEN 'academy_user' THEN
        v_tu_role := 'child';
        v_primary := false;
        v_user_type := 'Client Child';
        v_resolved_unicorn_role := 'Academy User';   -- CHANGED
    END CASE;
  ELSE
    IF v_invitation.unicorn_role::text = 'Admin' THEN
      v_tu_role := 'parent';
      v_primary := true;
      v_relationship_role := 'primary_contact';
      v_user_type := 'Client Parent';
      v_resolved_unicorn_role := 'Admin';
    ELSIF v_invitation.unicorn_role::text = 'User' THEN
      v_tu_role := 'child';
      v_primary := false;
      v_relationship_role := 'user';
      v_user_type := 'Client Child';
      v_resolved_unicorn_role := 'User';
    ELSE
      v_tu_role := 'child';
      v_primary := false;
      v_relationship_role := 'user';
      v_user_type := 'Vivacity Team';
      v_resolved_unicorn_role := v_invitation.unicorn_role::public.unicorn_role;
    END IF;
  END IF;

  IF v_invitation.tenant_id = 6372 THEN
    v_user_type := 'Vivacity Team';
  END IF;

  SELECT user_uuid INTO v_existing_uuid
  FROM public.users
  WHERE email = lower(v_invitation.email);

  IF v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id THEN
    UPDATE public.users
       SET user_uuid = p_user_id,
           first_name = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name  = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_resolved_unicorn_role,
           user_type = v_user_type,
           tenant_id = COALESCE(tenant_id, v_invitation.tenant_id),
           is_team = (v_user_type = 'Vivacity Team'),
           updated_at = now()
     WHERE user_uuid = v_existing_uuid;
  ELSIF v_existing_uuid IS NULL THEN
    INSERT INTO public.users (
      user_uuid, email, first_name, last_name, unicorn_role, user_type,
      tenant_id, is_team, disabled, archived
    ) VALUES (
      p_user_id,
      lower(v_invitation.email),
      COALESCE(NULLIF(v_invitation.first_name, ''), '-'),
      COALESCE(NULLIF(v_invitation.last_name, ''), '-'),
      v_resolved_unicorn_role,
      v_user_type,
      v_invitation.tenant_id,
      (v_user_type = 'Vivacity Team'),
      false,
      false
    );
  ELSE
    UPDATE public.users
       SET first_name = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name  = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_resolved_unicorn_role,
           user_type = v_user_type,
           tenant_id = COALESCE(tenant_id, v_invitation.tenant_id),
           updated_at = now()
     WHERE user_uuid = p_user_id;
  END IF;

  INSERT INTO public.tenant_users (
    user_id, tenant_id, role, primary_contact, access_scope, secondary_contact, relationship_role
  ) VALUES (
    p_user_id, v_invitation.tenant_id, v_tu_role, v_primary, 'full', false, v_relationship_role
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    primary_contact = EXCLUDED.primary_contact,
    relationship_role = CASE
      WHEN public.tenant_users.relationship_role = 'primary_contact' THEN 'primary_contact'::public.tenant_user_role
      WHEN public.tenant_users.relationship_role = 'secondary_contact' AND EXCLUDED.relationship_role IN ('user', 'academy_user') THEN 'secondary_contact'::public.tenant_user_role
      ELSE EXCLUDED.relationship_role
    END;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (
    v_invitation.tenant_id,
    p_user_id,
    CASE WHEN v_tu_role = 'parent' THEN 'Admin' ELSE 'General User' END,
    'active'
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    updated_at = now();

  UPDATE public.profiles
     SET active_tenant_id = (
           SELECT id_uuid FROM public.tenants WHERE id = v_invitation.tenant_id
         ),
         updated_at = now()
   WHERE user_id = p_user_id
     AND active_tenant_id IS NULL;

  UPDATE public.user_invitations
     SET status = 'accepted',
         accepted_at = now(),
         accepted_by_user_id = p_user_id,
         updated_at = now()
   WHERE id = v_invitation.id;

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_invitation.tenant_id,
    p_user_id,
    'user_invitations',
    v_invitation.id,
    'invitation_accepted',
    'User accepted invitation via self-service',
    jsonb_build_object(
      'email', v_invitation.email,
      'tenant_id', v_invitation.tenant_id,
      'unicorn_role', v_invitation.unicorn_role,
      'tenant_users_role', v_tu_role,
      'primary_contact', v_primary,
      'relationship_role', v_relationship_role::text,
      'invitation_relationship_role_source', CASE WHEN v_invitation.relationship_role IS NOT NULL THEN 'invitation_column' ELSE 'unicorn_role_fallback' END,
      'invitation_id', v_invitation.id,
      'relinked_from_uuid', CASE WHEN v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id
                                 THEN v_existing_uuid::text ELSE NULL END
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'SUCCESS',
    'tenant_id', v_invitation.tenant_id,
    'role', v_tu_role,
    'unicorn_role', v_invitation.unicorn_role,
    'primary_contact', v_primary,
    'relationship_role', v_relationship_role::text,
    'message', 'Invitation accepted successfully'
  );
END;
$function$;

-- ============================================================
-- 3. Backfill the live Academy Tester user (idempotent)
-- ============================================================
UPDATE public.users
   SET unicorn_role = 'Academy User'::public.unicorn_role,
       updated_at = now()
 WHERE user_uuid = '2d36fde6-983a-44b5-89e3-afb1ef6d7f0c'
   AND unicorn_role = 'User'::public.unicorn_role;

-- ============================================================
-- 4. RESTRICTIVE deny policies — 23 tables
--    Combine via AND with all existing permissive policies.
--    Academy tables intentionally excluded.
-- ============================================================

CREATE POLICY "client_packages_deny_academy_users" ON public.client_packages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "client_stage_documents_deny_academy_users" ON public.client_stage_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "generated_documents_deny_academy_users" ON public.generated_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "doc_files_deny_academy_users" ON public.doc_files
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "phase_instances_deny_academy_users" ON public.phase_instances
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "package_instances_deny_academy_users" ON public.package_instances
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "stage_instances_deny_academy_users" ON public.stage_instances
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "client_task_instances_deny_academy_users" ON public.client_task_instances
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "client_action_items_deny_academy_users" ON public.client_action_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "documents_deny_academy_users" ON public.documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "tasks_deny_academy_users" ON public.tasks
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "consult_logs_deny_academy_users" ON public.consult_logs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "time_entries_deny_academy_users" ON public.time_entries
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "notes_deny_academy_users" ON public.notes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "meetings_deny_academy_users" ON public.meetings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

-- 8 additional tables from RLS audit
CREATE POLICY "client_action_item_comments_deny_academy_users" ON public.client_action_item_comments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "client_audit_references_deny_academy_users" ON public.client_audit_references
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "client_package_stages_deny_academy_users" ON public.client_package_stages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "client_team_tasks_deny_academy_users" ON public.client_team_tasks
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "document_activity_log_deny_academy_users" ON public.document_activity_log
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "governance_document_deliveries_deny_academy_users" ON public.governance_document_deliveries
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "messages_deny_academy_users" ON public.messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

CREATE POLICY "support_requests_deny_academy_users" ON public.support_requests
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_academy_only_user(auth.uid()))
  WITH CHECK (NOT public.is_academy_only_user(auth.uid()));

COMMIT;
```

## Summary

- **23 RESTRICTIVE policies** (15 original + 8 added from audit). All FOR ALL, USING + WITH CHECK both deny Academy Users.
- **Helper function** `is_academy_only_user(uuid)` — SECURITY DEFINER, STABLE, locked search_path.
- **`accept_invitation_v2`** — full body, single-line edit on the `'academy_user'` branch.
- **Backfill** — exactly 1 row guarded by `WHERE user_uuid = ... AND unicorn_role = 'User'`.
- **Single transaction** — all-or-nothing.
- **Academy tables NOT touched** — Academy Users retain full read/write via existing policies on the 11 academy tables.

## After apply

I will pause for your verification on tenant 7533 before starting Phase 3 (frontend changes).
