-- Pre-launch invitation cleanup (one-shot)

-- 1. Audit-trail snapshot of every pending row before transition
INSERT INTO public.audit_eos_events (tenant_id, user_id, entity, entity_id, action, reason, details)
SELECT
  ui.tenant_id,
  NULL,
  'user_invitations',
  ui.id,
  'pre_launch_cleanup_snapshot',
  'Snapshot of stale invitation before pre-launch reset',
  to_jsonb(ui)
FROM public.user_invitations ui
WHERE ui.status = 'pending';

-- 2. Revoke pending invites pointing at orphaned/non-existent tenants (13 rows, all tenant_id = 319)
UPDATE public.user_invitations
   SET status = 'revoked',
       revoked_at = now(),
       revoked_reason = 'pre-launch cleanup; orphaned tenant (does not exist)',
       updated_at = now()
 WHERE status = 'pending'
   AND tenant_id NOT IN (SELECT id FROM public.tenants);

-- 3. Revoke pending invites for AHMRC Training (2 rows). They're real client contacts
-- (AHMRC is a Diamond RTO member) and will be re-invited via the Monday Superhero batch.
UPDATE public.user_invitations
   SET status = 'revoked',
       revoked_at = now(),
       revoked_reason = 'pre-launch reset; never sent — will be re-invited via Monday Superhero batch',
       updated_at = now()
 WHERE status = 'pending'
   AND tenant_id = 7449;

-- 4. Revoke remaining pending Vivacity-team invites (Carl + Brian). Vivacity STAFF —
-- re-invite via separate Vivacity team onboarding flow.
UPDATE public.user_invitations
   SET status = 'revoked',
       revoked_at = now(),
       revoked_reason = 'pre-launch reset; Vivacity team — re-invite via separate Vivacity onboarding flow',
       updated_at = now()
 WHERE status = 'pending'
   AND tenant_id = 6372;

-- 5. Verification — after this migration runs, zero pending rows must remain
DO $$
DECLARE
  v_pending int;
BEGIN
  SELECT count(*) INTO v_pending FROM public.user_invitations WHERE status = 'pending';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Cleanup failed: % invitations still pending after cleanup', v_pending;
  END IF;
END $$;