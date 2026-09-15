# 2026-09-15 — TOM P1.2-c rollback owner reconciled

## Decision

Existing [ADR-028](../../kb/reference/decision-trail.md#adr-028) is the
authoritative TOM baseline: Carl is rollback owner for every risk tier, with
no delegation to a separate operations role. That standing decision applies to
the P1.2-c supervised `unicorn-qa` disable-first run.

## Boundary

This reconciliation records an existing decision; it does not authorize a
hosted action. The operator must still verify a redeployable rollback artifact,
the rollback trigger, and the supervised preflight before any disable. Any
rollback remains limited to restoring the verified function artifact and does
not authorize account repair, invitation, job, migration, credential, or
production work.
