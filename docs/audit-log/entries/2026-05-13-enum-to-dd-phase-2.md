# Audit: 2026-05-13 - enum-to-dd Phase 2 closure

**Trigger:** Lovable production DB change session for Phase 2 enum-to-`dd_` rollout.
**Author:** Khian (Brian)
**Scope:** Phase 2 enum families only: `evidence_type`, `sch_booking_status`, and `srto_source_type`. Verified live DB shape, regenerated Supabase types, SRTO retrieval RPC behavior, and local frontend build. Out of scope: Phase 1 unused-enum cleanup, Phase 3 notification enums, Phase 4 role/access enums, Phase 5 EOS/workflow enums, and unrelated Supabase advisor findings.
**Supabase project:** `yxkgdalkbrriasiyyrwk` - Unicorn 2.0-dev

---

## Findings

- Phase 2 is closed. All three Phase 2 enum families have shipped as `dd_` lookup-backed fields:
  - `evidence_type` -> `dd_evidence_type` via migration `20260513003358_d864ee2c-673a-4968-899c-d6dc08c21194.sql`.
  - `sch_booking_status` -> `dd_sch_booking_status` via migration `20260513013856_434a7ae3-a23b-4858-b6fb-575fb88df0bb.sql`.
  - `srto_source_type` -> `dd_srto_source` via migration `20260513022556_db52bac2-aceb-48f7-8f73-8f9ff94afc27.sql`.
- `srto_source_type` was the only Phase 2 candidate with meaningful runtime blast radius because it feeds SRTO semantic retrieval. The migration correctly converted `srto_corpus.source_type` to `text NOT NULL`, added a validated FK to `dd_srto_source(value)`, rebuilt `srto_corpus_source_type_idx`, and replaced `match_srto_chunks` with text-typed `filter_source_type` and returned `source_type`.
- Live DB post-checks passed:
  - `dd_srto_source` has 7 active rows.
  - `srto_corpus.source_type` is `text` and `NOT NULL`.
  - Existing source distribution is unchanged: `compliance_requirements=27`, `credential_policy=6`, `outcome_standards=23`, `practice_guide=65`.
  - `srto_corpus_source_type_fkey` exists and is validated.
  - `srto_corpus_source_type_idx` exists on the text column.
  - `match_srto_chunks` now has `filter_source_type text` and returns `source_type text`.
  - `public.srto_source_type` remains as a legacy rollback enum.
  - Grant parity on `match_srto_chunks` is `PUBLIC EXECUTE`.
- Live retrieval smoke checks passed:
  - Unfiltered `match_srto_chunks` returned rows.
  - `filter_source_type = 'practice_guide'` returned only `practice_guide`.
  - `filter_source_type = 'national_code'` returned no rows and no SQL error, expected because no National Code rows exist in dev corpus yet.
- Codebase grep found no active app or edge-function dependency on the enum type. Remaining `srto_source_type` references are expected: generated legacy enum definition and migration history.
- Live catalog checks found no public table columns or public functions still depending on `public.srto_source_type`; only the enum's internal array type dependency remains.
- Local build verification passed after installing dependencies: `npm.cmd run build` completed successfully. Build warnings were pre-existing/operational: large chunk warnings, stale Browserslist data, one CSS selector skip.
- `npm.cmd install` modified `<codebase>/package-lock.json` locally while installing dependencies for verification. This was not part of the Lovable migration and was not committed.

## KB changes shipped

- no changes

## Codebase observations (read-only)

- `<codebase>` @ `b93008e17d9d635f54d38f3150cfbec3ab3a20cd`: Phase 2 migrations and regenerated Supabase types are present on `main`.
- `unicorn-kb` @ `f99af7f51131facf6fef489684a8acfb12f3bab2`: no KB commit was shipped as part of this audit. The workspace-root inventory file `EnumToDdInventory.md` was updated locally to mark Phase 2 done, but it is outside the tracked sub-repos.

## Decisions

- Phase 2 enum-to-`dd_` stream is complete.
- `srto_source_type` legacy enum remains in place for rollback safety; future source-type additions should land in `dd_srto_source`, not by altering the enum.
- Phase 3 remains notification-related enums; Phase 4 remains relationship/user role enums; Phase 5 remains broad workflow/EOS/status enums.

## Open questions parked

- `package-lock.json` is dirty in the local `<codebase>` checkout because dependencies were installed for build verification. Do not commit or revert from the audit repo session.
- SRTO corpus population decisions remain open in `unicorn-kb/pinned/decisions.md`: National Code / CRICOS / ESOS corpus rows are not yet populated, so `national_code`, `cricos_practice_guide`, and `esos_act` source types currently have zero live corpus rows.
- Supabase advisor findings surfaced during the session, including unrelated RLS/security warnings. They were not part of Phase 2 and should not be bundled with enum migration closure.

## Tag

`audit-2026-05-13-enum-to-dd-phase-2`
