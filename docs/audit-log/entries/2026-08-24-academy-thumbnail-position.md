# Audit: 2026-08-24 — Academy thumbnail positioning

**Trigger:** ad-hoc product fix
**Scope:** Academy course thumbnail rendering and the Academy Builder course settings surface.

## Findings

- Vimeo thumbnails are generally 16:9, while the Academy course card intentionally uses a square frame.
- The card used a centered `object-cover`, which could crop a presenter, title, or other important focal content.
- A per-course focal point preserves the existing square design while allowing staff to control what remains visible.
- Slider-only positioning was less discoverable than a crop tool, so the editor now supports drag-to-pan, zoom, and a full-image mode.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- pending PR commit: added persisted `thumbnail_position`, `thumbnail_fit`, and `thumbnail_zoom` values with builder preview controls.

## Decisions

- Keep the existing square card design unchanged.
- Store the focal point as a bounded CSS percentage pair with a centered default (`50% 50%`).
- Keep `cover` as the default; `contain` is opt-in when the full Vimeo frame is more important than edge-to-edge fill.

## Open questions parked

- A full drag-to-position cropper may be added later if slider controls prove insufficient.
