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
