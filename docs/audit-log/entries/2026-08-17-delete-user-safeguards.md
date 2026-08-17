# Audit: 2026-08-17 — delete-user safeguards

**Trigger:** security-remediation consequence audit
**Scope:** Edge Function authorization and destructive user-removal ordering.

## Findings

- The function allowed self-deletion and could remove the last active tenant administrator.
- Its audit insert occurred only after the irreversible Auth deletion and ignored audit-write failure.

## Code changes (if this entry accompanies one)

- Reject self-deletion and last-active-admin removal using authoritative `tenant_members` records.
- Fail closed on membership or audit-write failures and write the audit event before deleting the Auth user.

## Decisions

- A tenant must have another active `admin` member assigned before any current admin can be deleted.

## Production deployment and verification

- Deployed the exact committed PR bundle to the hosted `delete-user` Edge Function on 2026-08-17 (version 714; `verify_jwt: false`, preserved from the prior deployment).
- Retrieved the hosted source after deployment and confirmed it contains `SELF_DELETE_FORBIDDEN`, `LAST_ADMIN_FORBIDDEN`, and `AUDIT_WRITE_FAILED` safeguards.
- Confirmed the `audit_eos_events` insert is ordered before `auth.admin.deleteUser`, so an audit-write failure prevents the irreversible Auth deletion.
- Verification commands passed: `node supabase/functions/delete-user/safeguards.test.mjs` and `npx tsc --noEmit`.
