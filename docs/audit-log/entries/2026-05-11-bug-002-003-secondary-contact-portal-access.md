# Audit: 2026-05-11 — bug-002-003-secondary-contact-portal-access

**Trigger:** ad-hoc — bug fix shipped; recording closure of BUG-002 and BUG-003
**Author:** Khian (Brian)
**Scope:** Secondary contact portal access — Invite button, checkboxes, and bulk actions disabled for secondary contacts. Two files patched via Lovable prompt on 11 May 2026.

---

## Findings

- **BUG-002** (`ClientUsersPage.tsx`): Invite button and bulk action controls were disabled for secondary contacts because the component was reading `getTenantRole()` (old pattern) instead of the canonical `canManagePortalUsers` flag. Secondary contacts with full portal access were incorrectly treated as read-only.
- **BUG-003** (`ClientTasksPage.tsx`): Same root cause — `getTenantRole()` pattern used instead of `canManagePortalUsers`. Checkboxes and bulk actions were disabled for secondary contacts.
- Both bugs shared an identical root cause and were fixed in a single Lovable prompt touching two files (~10 lines total). No schema change, no migration required.
- **Follow-on (BUG-020):** Fix introduced a minor over-permission — secondary contacts can now invite new portal users, which may not be the intended design. Primary contacts only were likely intended to hold invite rights. Low risk; Angela confirmation required before fixing. Tracked separately in BugOrganisation.md.

## KB changes shipped

- No KB changes this session.

## Codebase observations (read-only)

- Fix committed to `unicorn-cms-f09c59e5` main branch on 11 May 2026.
- Commit reference: fix shipped via Lovable — `fix/admin-source-of-truth` branch.

## Decisions

- No ADRs drafted.
- BUG-020 (secondary contact invite over-permission) parked pending Angela confirmation on intended permission split.

## Tag

`audit-2026-05-11-bug-002-003-secondary-contact-portal-access`
