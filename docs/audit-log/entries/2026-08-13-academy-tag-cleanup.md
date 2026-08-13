# Audit: 2026-08-13 — Academy tag cleanup + Tag Management tool

**Trigger:** ad-hoc
**Scope:** `academy_courses.tags` data quality, and the lack of any admin tooling
to manage it. Did not touch `target_audience` (Pathways) or `webinar_series`
(series groupings) — those are separate classification axes with their own,
already-adequate editing UX in Academy Builder's course editor.

## Findings

- No RPC, migration, or edge function existed anywhere in `supabase/**` for
  bulk tag rename/merge/delete — every tag edit happened one course at a time
  via the free-text `TagChipInput` in the course editor, with no visibility
  into cross-course duplication.
- 190 distinct tags across 418 tag instances on 82 tagged, non-archived
  courses — for context, that's ~2.3 tags of proliferation per course's worth
  of genuine sub-categories. A large share of the mess was mechanical
  (casing: `ASQA`/`asqa`; hyphen-vs-space: `assessment-tools`/`assessment
  tools`; singular/plural: `reasonable adjustment`/`reasonable adjustments`;
  one outright typo: `aqsa standards`), but the two largest tags in the whole
  dataset — `compliance` (32 courses) and `rto compliance` (29 courses) — were
  two spellings of the same concept, as were `standards` (3) vs `rto
  standards` (6), and the bare `rto` tag (11 courses) added no filtering value
  since virtually every course on the platform is RTO-related.

## Code changes (this entry accompanies one)

- New `/superadmin/academy/tag-management` page
  (`src/pages/superadmin/AcademyTagManagementPage.tsx`) + hook
  (`src/hooks/academy/useAcademyTagManagement.ts`): lists every distinct tag
  with its live course count, lets staff rename/merge (same operation — typing
  an existing tag's name collapses the two) or remove a tag from every course
  that carries it, with an expandable per-tag list of affected courses linking
  back into the course editor. Nav entry added to the Academy section
  (Super Admin only, mirroring the Workforce PDP visibility pattern).
- Reuses the existing `academy_courses.tags` `text[]` column directly — no
  schema change. Each rename/merge/delete does a `.contains("tags", [tag])`
  lookup then one `.update()` per affected course (dedupes via `Set` so a
  course already carrying both the old and new spelling doesn't end up with
  the tag twice).

## Data backfill (this entry accompanies one)

Applied a one-off mapping via `apply_migration`/`execute_sql` (dry-run
verified against all 82 affected rows before running) collapsing:
- Mechanical duplicates: casing, hyphen-vs-space, singular/plural, and the
  `aqsa standards` → `asqa standards` typo.
- Clear synonyms: `srto-2025`/`standards 2025`/`rto standards 2025` → `srto
  2025`; `asqa compliance` → `rto compliance`; `engagement strategies` →
  `student engagement`.
- Taxonomy calls made with Carl's explicit sign-off: `compliance` → `rto
  compliance` (the single biggest change — 61 courses combined); `standards`
  → `rto standards`; `rto regulation`/`regulatory requirements` → `rto
  requirements`; `strategic` → `strategic planning`; bare `rto` removed
  outright (too generic to filter anything) rather than merged.
- Deliberately left alone: `vet compliance`/`vet standards` (GTOs sit under a
  different Standards framework than RTOs, per this org's own instructions —
  didn't want to collapse RTO- and VET-sector tags together);
  `self-assurance` vs `self-assessment` (genuinely different regulatory
  terms under the new Standards); `asqa`/`asqa audit`/`asqa standards`
  (different angles, not duplicates); named-looking program tags
  (`rto-startup`, `kickstart`, `launch`, `flight-plan`) left untouched on the
  chance they're intentional package/program labels rather than topic tags.

Result: 190 → 162 distinct tags, 418 → 407 tag instances (11 fewer, from the
bare `rto`/`RTO` removal rather than a rename). Verified post-hoc that none of
the merged-away spellings remain, and spot-checked the new counts against the
expected arithmetic (e.g. `rto compliance` 29 + 32 + 1 = 62 ✓, `audit` 4 + 3 +
1 = 8 ✓) before and after live in the new Tag Management page.

## Decisions

- Merge and rename are implemented as the same code path (typing a name that
  already exists on another course *is* the merge) rather than a separate
  merge UI — simpler, and the "will merge into" hint in the rename input
  gives the same visibility a dedicated merge flow would.
- Semantic taxonomy calls (compliance/standards/rto clusters) were proposed
  with confidence tiers and Carl's explicit sign-off obtained before running
  anything — the mechanical fixes (casing/hyphen/typo) didn't need the same
  scrutiny and were included by default.

## Open questions parked

- `webinar_series` (`"8 Critical Drivers to RTO Success"` etc.) exists only
  as a training-series label, not a structured mapping against the
  organisation's actual 8 Critical Drivers framework — noted as a possible
  future taxonomy project, not actioned here.
- The remaining ~100 single-use tags (now visible via the tool's "Single-use
  only" filter) weren't reviewed individually — left for Carl/Angela to work
  through opportunistically using the new tool.
