# Add video to Vivacity Academy — The Compliance Lab

Add the Vimeo video `https://vimeo.com/1215370924` as a published lesson titled
**Inclusive Practice & Reasonable Adjustment Plans** in the **The Compliance Lab** course.

## Current state (verified)

- The Compliance Lab exists as course id 29, slug `the-compliance-lab`, audience `compliance_manager`, and its **status is `draft`**.
- It currently has **no modules and no lessons**.
- There is **no "The Compliance Lab" video folder** in `training_folders` (only Compliance Webinar, RTO Compliance Works, etc.).
- `training_videos.folder_id` is required, so a folder must exist before the video row.

## What will be added (data only, no code changes)

1. A video folder **"The Compliance Lab"** in `training_folders`.
2. A video row in `training_videos`: name = the lesson title, `vimeo_url = https://vimeo.com/1215370924` (share/tracking query params stripped — the player builds the embed from the ID), folder set to the new folder.
3. A module **"Module 1"** in `academy_modules` for course 29 (sort_order 1), since the course has none yet and lessons require a module.
4. A lesson in `academy_lessons`: title = "Inclusive Practice & Reasonable Adjustment Plans", `lesson_type = 'video'`, linked to the new video, `sort_order = 1`, `is_published = true`.

## Decision needed on course visibility

You asked to publish now, but the course itself is still a draft, so learners will not see the lesson until the course is published. The plan sets the lesson to published and **leaves the course as draft** unless you tell me to also flip course 29 to `published`.

## Technical notes

- All four rows are inserted via the data-insert path (no schema migration required).
- `created_at` defaults are used; `updated_at` is trigger-managed.
- Duration will be left null; the existing `academy_lesson_set_minutes_from_video` trigger/logic fills minutes when video duration is known.
