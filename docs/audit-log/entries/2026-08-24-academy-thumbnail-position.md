# Audit: 2026-08-24 — Academy thumbnail positioning

**Trigger:** ad-hoc product fix
**Scope:** Academy course thumbnail rendering and the Academy Builder course settings surface.

## Findings

- Vimeo thumbnails are generally 16:9, while the Academy course card intentionally uses a square frame.
- The card used a centered `object-cover`, which could crop a presenter, title, or other important focal content.
- A per-course focal point preserves the existing square design while allowing staff to control what remains visible.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- pending PR commit: added a persisted `thumbnail_position` focal point and builder preview controls.

## Decisions

- Keep the existing square card design unchanged.
- Store the focal point as a bounded CSS percentage pair with a centered default (`50% 50%`).

## Open questions parked

- A full drag-to-position cropper may be added later if slider controls prove insufficient.
