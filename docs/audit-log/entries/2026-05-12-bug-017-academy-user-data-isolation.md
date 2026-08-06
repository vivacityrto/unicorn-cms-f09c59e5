# Audit: 2026-05-12 — bug-017-academy-user-data-isolation

**Trigger:** ad-hoc — bug investigation requested; Lovable fix shipped; live verification completed
**Author:** Khian (Brian)
**Scope:** Academy-only users still being treated like normal tenant members for conversations, inbox, and ticket-related access. Verified the production database change, the follow-up code changes, and the live result for the affected test account.

---

## Findings

- Academy-only users were still carrying an "active member" record in an older tenant-membership table. Even though the newer role data already said "Academy-only", that older record still made the system treat them like a normal tenant user in some places.

- Lovable shipped a proper fix across both database and app code. The database now updates relationship-role data in one place instead of letting related records drift apart, invitation acceptance now keeps role and access level aligned, and the one drifted academy-only membership row in production was corrected.

- The client-side role-change flow was also updated to use the new database entry point, so future role edits from the UI should keep the related records in sync instead of splitting again.

- The direct-add invite path was updated too. That means academy-only users added without an email invitation now land with the correct Academy-only access and an inactive legacy membership, rather than being accidentally treated as a full tenant user.

- The communications hook now explicitly blocks academy-only users from loading tenant conversations, messages, and unread counts. This is defence in depth on top of the database fix.

- Live verification passed. The academy/member drift query now returns 0 rows. The test account `khianbsismundo@gmail.com` on tenant `7517` is Academy-only in `tenant_users`, inactive in `tenant_members`, and the tenant access check now returns `false`.

- Full-access tenant contacts still work. A secondary contact on the same tenant still returns `true` for tenant access, so the fix did not cut off legitimate client users.

- One small consistency gap remains parked, but it does not reopen the bug: the test account's `users.unicorn_role` was still labelled `User` at verification time rather than `Academy User`. Access behaviour was already correct, so BUG-017 is still considered closed.

---

## KB changes shipped

- no changes

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5@7e0843c1` — Lovable pull includes the BUG-017 migration plus code changes in `TenantUsersTab.tsx`, `useClientCommunications.ts`, and `supabase/functions/invite-user/index.ts`.
- The new migration file is `supabase/migrations/20260512072202_28dd224f-b5f8-4277-8fc1-50eec1200282.sql`.
- `BugOrganisation.md` in the shared workspace was updated during verification to mark BUG-017 resolved, but that file is outside `unicorn-audit/` and not part of this audit commit.

---

## Decisions

- BUG-017 is closed.
- The remaining `users.unicorn_role` mismatch on the test account is parked as a follow-up cleanup only if it becomes useful. It is not treated as part of the security/access bug.

---

## Open questions parked

- Should the parked test-account role-label mismatch be cleaned up through a tiny named migration for auditability, or left alone because the account is only for testing and access behaviour is already correct?

---

## Tag

`audit-2026-05-12-bug-017-academy-user-data-isolation`
