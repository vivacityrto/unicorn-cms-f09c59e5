# Audit: 2026-08-18 — academy-historical-facilitators

**Trigger:** ad-hoc
**Scope:** Academy facilitator metadata and the Trainers Edge series.

## Findings
- Former facilitator Sam Holtham no longer has an auth/user profile, while Academy courses require an auth-user UUID for the legacy facilitator field.
- Six published Trainers Edge courses had no facilitator and three used Test CSC, an active placeholder account.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- Added a non-login historical-facilitator directory and a display-name override for Academy courses.
- Backfilled all nine Trainers Edge courses to Sam Holtham without recreating account access.

## Decisions
- Former or external facilitators are selectable separately from Vivacity staff accounts.

## Open questions parked
- no changes
