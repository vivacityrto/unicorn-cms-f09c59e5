UPDATE public.user_invitations
SET status = 'revoked',
    revoked_at = now(),
    revoked_reason = 'Stale pending invite — cleared after cancel-invite v308 vocabulary fix',
    token_hash = NULL
WHERE id = '730b972e-be7f-489f-b1e5-a82d1f84a330'
  AND status = 'pending';