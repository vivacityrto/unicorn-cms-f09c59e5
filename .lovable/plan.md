# TICKET-003 — Implementation: tenant match validation for `enrol_as_impersonator`

Idempotency design corrected: keep the existing-row SELECT on `(course_id, user_id)` only (matches the `UNIQUE (course_id, user_id)` constraint), then branch on tenant mismatch with `existing_enrolment_different_tenant`.

## Phase 1 — Migration

**Filename**: `supabase/migrations/20260513090000_enrol_as_impersonator_tenant_match.sql`

**Description for the migration tool**: Hardens the staff impersonation enrol RPC. The function now requires the staff member's active preview tenant id, validates that the target user belongs to that tenant, refuses re-enrolment under a different tenant, and stamps the audit notes with the tenant. The legacy 2-argument version is removed.

**SQL body**:

```sql
-- Drop legacy 2-arg overload
DROP FUNCTION IF EXISTS public.enrol_as_impersonator(bigint, uuid);

CREATE OR REPLACE FUNCTION public.enrol_as_impersonator(
  p_course_id      bigint,
  p_target_user_id uuid,
  p_tenant_id      bigint
)
RETURNS public.academy_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor    uuid := auth.uid();
  v_course   public.academy_courses%ROWTYPE;
  v_existing public.academy_enrollments%ROWTYPE;
  v_new_row  public.academy_enrollments%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = v_actor
      AND (lower(global_role) IN ('superadmin','admin')
           OR is_vivacity_internal = true)
  ) THEN
    RAISE EXCEPTION 'not_authorised_impersonator' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_context_required' USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE user_uuid = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'invalid_target_user' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE user_id = p_target_user_id
      AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'target_user_not_in_tenant' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_course
  FROM public.academy_courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_course.status <> 'published' THEN
    RAISE EXCEPTION 'course_not_available' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency on (course_id, user_id) — matches UNIQUE constraint
  SELECT * INTO v_existing
  FROM public.academy_enrollments
  WHERE course_id = p_course_id
    AND user_id   = p_target_user_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.tenant_id <> p_tenant_id THEN
      RAISE EXCEPTION 'existing_enrolment_different_tenant' USING ERRCODE = 'P0002';
    END IF;
    IF v_existing.status = 'revoked' THEN
      UPDATE public.academy_enrollments
      SET    status        = 'active',
             revoked_at    = NULL,
             revoked_by    = NULL,
             revoke_reason = NULL,
             updated_at    = now()
      WHERE  id = v_existing.id
      RETURNING * INTO v_new_row;
      RETURN v_new_row;
    END IF;
    RETURN v_existing;
  END IF;

  INSERT INTO public.academy_enrollments (
    course_id, user_id, tenant_id, status, source,
    enrolled_at, enrolled_by, notes
  )
  VALUES (
    p_course_id,
    p_target_user_id,
    p_tenant_id,
    'active',
    'staff_impersonation',
    now(),
    v_actor,
    'Enrolled by staff impersonation; actor=' || v_actor::text || '; tenant=' || p_tenant_id::text
  )
  RETURNING * INTO v_new_row;

  RETURN v_new_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.enrol_as_impersonator(bigint, uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enrol_as_impersonator(bigint, uuid, bigint) TO authenticated;

COMMENT ON FUNCTION public.enrol_as_impersonator(bigint, uuid, bigint) IS
  'Staff-only impersonation enrol. Requires explicit p_tenant_id matching the staff member''s active preview context. Validates target is a member of p_tenant_id. Sets source=''staff_impersonation'', enrolled_by=actor, user_id=target. Idempotent per (course_id, user_id). SECURITY DEFINER.';
```

## Phase 2 — Frontend: `src/hooks/academy/useEnrolCourse.ts`

Full replacement (57 lines, all changes inline):

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAcademyActingUserId } from "@/hooks/academy/useAcademyActingUserId";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import {
  useReadOnlyGuard,
  PREVIEW_BLOCKED_ERROR,
  isPreviewBlockedError,
} from "@/hooks/useReadOnlyGuard";
import { friendlyDbError } from "@/lib/friendlyDbError";

const TENANT_CONTEXT_REQUIRED = "tenant_context_required";

export function useEnrolCourse() {
  const qc = useQueryClient();
  const { userId, isImpersonating } = useAcademyActingUserId();
  const { previewTenant } = useClientPreview();
  const { blockWrite } = useReadOnlyGuard();
  const canMutate = userId !== null;

  const mutation = useMutation({
    mutationFn: async (courseId: number) => {
      if (blockWrite("Enrol")) throw new Error(PREVIEW_BLOCKED_ERROR);
      if (!userId) throw new Error("No acting user resolved");

      if (isImpersonating) {
        if (!previewTenant?.id) {
          throw new Error(TENANT_CONTEXT_REQUIRED);
        }
        const { data, error } = await supabase.rpc("enrol_as_impersonator", {
          p_course_id: courseId,
          p_target_user_id: userId,
          p_tenant_id: previewTenant.id,
        });
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase.rpc("enrol_in_academy_course", {
        p_course_id: courseId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isImpersonating ? "Enrolled (as impersonated user)" : "You're enrolled");
      qc.invalidateQueries({ queryKey: ["academy-my-enrolled-courses"] });
      qc.invalidateQueries({ queryKey: ["academy-my-courses"] });
      qc.invalidateQueries({ queryKey: ["academy-dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["academy-courses"] });
      qc.invalidateQueries({ queryKey: ["academy-enrollment-detail"] });
      qc.invalidateQueries({ queryKey: ["academy-enrollment-raw"] });
    },
    onError: (e: Error) => {
      if (isPreviewBlockedError(e)) return;
      const msg = (e?.message ?? "") + " " + JSON.stringify(e ?? {});
      if (msg.includes("tenant_context_required")) {
        toast.error("No active tenant context — exit and re-enter the client view");
        return;
      }
      if (msg.includes("target_user_not_in_tenant")) {
        toast.error("This user does not belong to the current tenant");
        return;
      }
      if (msg.includes("existing_enrolment_different_tenant")) {
        toast.error("This user is already enrolled under a different tenant context");
        return;
      }
      toast.error(friendlyDbError(e, "useEnrolCourse"));
    },
  });

  return { ...mutation, canMutate };
}
```

## Phase 3 — Verification (run after migration approval)

```sql
-- V1
SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc
WHERE proname = 'enrol_as_impersonator'
  AND pronamespace = 'public'::regnamespace;

-- V2
SELECT proname, prosecdef, proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname = 'enrol_as_impersonator';

-- V3
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'enrol_as_impersonator';
```

Expected: V1 single row with `p_course_id bigint, p_target_user_id uuid, p_tenant_id bigint`; V2 `prosecdef=true`, `proconfig` contains `search_path=`; V3 `authenticated / EXECUTE` present, no `PUBLIC`.

**Manual UI**: enrol acting user (member of preview tenant) → success and `tenant_id` matches; cross-tenant attempt → "This user does not belong to the current tenant"; cleared preview → client-side toast "No active tenant context…", no RPC; existing enrolment under another tenant → "already enrolled under a different tenant context"; revoked re-enrol → reactivates.

## Risk

- Single call site updated atomically with the signature change — no orphan callers.
- `SECURITY DEFINER`, `SET search_path TO ''`, fully-qualified refs preserved.
- Idempotency aligned with `UNIQUE (course_id, user_id)` — no constraint-violation hazard.
- BUG-024 preview-mode behaviour unchanged. `/manage-tenants` counts unaffected.
