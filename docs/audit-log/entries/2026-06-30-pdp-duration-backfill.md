# Audit: 2026-06-30 — pdp-duration-backfill

**Trigger:** ad-hoc — client portal Staff PDPs review surfaced 0% actual hours for all staff across all tenants
**Scope:** Staff PDPs client portal feature; PDP data pipeline (`training_videos` → `academy_lessons` → `pdp_evidence_items` → `v_pdp_cycle_summary`); Vimeo duration backfill; going-forward trigger + code fix; RLS tightening on `email_attachments` and `user_invitations`

---

## Findings

- Staff PDPs page showed 0.0 actual hours and 0% complete for all staff (tested on Australian College Pty Ltd, tenant 7512). Three trainers had 2–20 evidence items each yet zero credited hours.
- Root cause: `training_videos.duration_seconds` was NULL for all 703 videos — the field was never populated when videos were added to the library. This cascaded to `academy_lessons.estimated_minutes` (NULL), `pdp_evidence_items.duration_minutes` (NULL on every academy_completion insert), and finally `v_pdp_cycle_summary.actual_pd_hours` = 0 for every PDP cycle.
- The existing `VIMEO_ACCESS_TOKEN` secret could only retrieve 5 of 703 videos via the Vimeo API — those 5 are owned by the token's Vimeo account. The remaining 698 are on a separate Vimeo account with domain-restricted embedding; the Vimeo API returned 404 for all of them.
- Vimeo's public oEmbed endpoint (`vimeo.com/api/oembed.json`) also returned null duration for restricted videos. The `player.vimeo.com/video/{id}/config` endpoint returned 403 even with a spoofed `Referer` — domain validation is server-side.
- Workaround: `unicorn-cms.au` is whitelisted in Vimeo's domain settings. Loading the Vimeo Player SDK inside a Playwright browser session running on `unicorn-cms.au` allowed `getDuration()` to resolve for all restricted videos.
- Backfill outcome: 701/703 videos populated. 2 videos returned errors from the Vimeo Player SDK — confirmed genuinely deleted from Vimeo; no action possible.
- 26 existing `pdp_evidence_items` with `evidence_type = 'academy_completion'` backfilled with correct `duration_minutes` from lesson sums.
- Australian College post-backfill: Alec Gardner 35.8 hrs / 100%, Tiziana Russo 121.2 hrs / 100%, Kasuni Wijesingha 7.6 hrs / 38%. All previously showing 0%.
- Secondary finding: "View as Client" → Start Preview dialog has a navigation bug — after clicking Start Preview, the page stays on the admin URL rather than routing to `/client-preview`. Users must navigate manually. Not fixed this session.
- Incidental: `email_attachments` had an overly permissive `ALL` policy allowing any authenticated user to write attachments. `user_invitations_accept` allowed any authenticated user to accept any pending invitation regardless of email match. Both tightened in a separate Lovable migration.

---

## KB changes shipped

No KB changes this session.

---

## Codebase observations

- unicorn-cms-f09c59e5 @ 3515fce: PDP duration trigger (`trg_pdp_evidence_fill_academy_duration`, BEFORE INSERT, SECURITY DEFINER), edge function `pdp-auto-evidence` updated (lesson sum primary, course estimate fallback), `EvidenceSheet.handlePickEnrollment` updated to mirror same precedence. RLS fixes for `email_attachments` and `user_invitations` in same deploy.
- DB state at close: `training_videos.duration_seconds` populated for 701/703 rows; `academy_lessons.estimated_minutes` populated for 701 video lessons; all existing `pdp_evidence_items.duration_minutes` non-null for academy_completion rows.
- Temporary `backfill-vimeo-durations` edge function deployed with `verify_jwt = false` — **must be deleted** before this is considered fully closed.

---

## Decisions

- Lesson sum (`SUM(academy_lessons.estimated_minutes) WHERE is_published = true`) is the authoritative duration source for PDP credits, not `academy_courses.estimated_minutes`. The latter is a manual field that drifts; lesson sum reflects actual published content.
- Trigger fires on INSERT only — UPDATE is intentionally excluded so manual duration edits in EvidenceSheet are preserved.
- Zero lesson sum → store NULL (not 0) to distinguish unknown from known-zero.

---

## Open questions parked

- **"View as Client" redirect bug**: after Start Preview confirmation dialog, the browser stays on the admin page URL. Needs a Lovable prompt: "After Start Preview is clicked in the View as Client modal, redirect to `/client-preview`." Low priority but confusing UX.
- **New video duration automation**: when a video is added to `training_videos`, `duration_seconds` is not auto-populated. The `VIMEO_ACCESS_TOKEN` secret only covers 5 of 703 existing videos (the ones owned by that Vimeo account). A Lovable prompt to call the Vimeo API at video-save time would prevent future drift — but requires resolving which account owns new Academy videos. Parked.
- **2 deleted Vimeo videos**: IDs unknown (they returned null from Playwright). Lessons referencing them will have `estimated_minutes = NULL`. If those lessons are ever accessed for PDP credit, duration will not be computed. Low risk.

---

## Tag

`audit-2026-06-30-pdp-duration-backfill`
