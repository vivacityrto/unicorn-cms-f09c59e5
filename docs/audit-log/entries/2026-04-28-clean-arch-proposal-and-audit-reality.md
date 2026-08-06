# Audit: 2026-04-28 — Clean Architecture proposal review + audit-repo reality

**Trigger:** drift-surfaced, ad-hoc. Carl asked Claude (in the unicorn-kb
Claude Project) to discuss the Clean Architecture proposal on the
codebase. Reading the proposal turned up two pieces of pinned-KB drift;
asking the audit-repo follow-up question turned up three more.
**Scope:** review of `reference/clean-architecture-refactor.md` against
pinned KB; verification of `<codebase>/docs/` contents and audit-repo
existence/structure; drafting of corrective KB updates across three repos.
No code changed. No Lovable prompt sent. No proposal advanced.

---

## Findings

- **Clean Architecture proposal stands up to first-read review.** Pain
  ranking is grounded in actual `<codebase>` survey at `cf8d1314`. The
  "single enforceable ESLint rule" framing is the right lever. Vertical-
  slices-via-Lovable migration shape matches the operating-model reality
  in ADR-011. Lifecycle Checklists pilot is well-chosen (bounded, admin-
  only blast radius). Five critiques captured in chat for Carl's reading
  if the proposal advances; they belong in the proposal doc, not here.

- **`<codebase>/docs/` rule violated comprehensively.**
  `pinned/kb-hygiene.md → The three-repo architecture` claims `<codebase>/`
  has no `/docs` folder. Actual contents at HEAD: 23 markdown files plus
  3 subdirectories (`client-portal/`, `eos/`, `ui/`), including specs
  the pinned KB itself cites as authoritative
  (`docs/EOS_LEVEL10_SPECIFICATION.md`,
  `docs/INVITE_USER_DIAGNOSTICS.md`). The rule was already implicitly
  broken inside the pinned KB.

- **`<codebase>/docs/TGA_SECRETS.md` exists; contents not inspected
  this session.** Filename alone alarming given KB's "What NEVER goes
  in" list forbids secrets. Filed as follow-up — could be a doc *about*
  secrets management rather than a leak, but needs verification.

- **`reference/clean-architecture-refactor.md` not in source-of-truth
  table.** Doc exists, is referenced from `reference/cadence.md →
  Roadmap → Next`, but `pinned/kb-hygiene.md → Source-of-truth per fact`
  doesn't list it.

- **`unicorn-audit` repo claimed local-only; actually on GitHub since
  2026-04-24.** Workspace-root `CLAUDE.md` says
  `_(local only)_ / _(not on GitHub)_`. Actual: public repo at
  `ComplyHub-ai/unicorn-audit`, last pushed 2026-04-27. Two real
  audit entries already in `audit/`.

- **`audits/` vs `audit/` directory naming.** On-disk reality is
  `audit/` (singular). `unicorn-kb/pinned/kb-hygiene.md`,
  `unicorn-audit/README.md`, `unicorn-audit/CLAUDE.md`, and the link in
  `unicorn-audit/INDEX.md` all use `audits/` (plural), making the INDEX
  link a 404. Source-precedence rule (disk wins over docs) decides:
  docs catch up to disk. Previously parked in
  `audit/2026-04-27-codebase-week-review.md → Open questions parked`;
  actioned this session.

- **`unicorn-audit/CLAUDE.md` Session-end ritual conflicts with
  workspace-root.** Sub-repo CLAUDE.md says "merge the branch into
  main" + "push commits + tags". Workspace-root CLAUDE.md forbids push
  to main and requires stopping at PR creation. Workspace root is
  the higher authority for cross-repo work and must be respected;
  sub-repo CLAUDE.md needs the same PR-based session-end. Previously
  parked in `audit/2026-04-27-codebase-week-review.md`; actioned this
  session.

- **Audit-trail ownership = Carl** (confirmed 2026-04-28). Stale
  references to "Angela" remain in `audit/2026-04-24-kb-restructure.md`
  Decisions section; unchanged per the audit-immutability rule (see
  Open questions parked).

- **Audit-repo source precedence — decided NOT to route to it.** Carl's
  call. Audit is historical narrative, not a current-state source;
  routing would conflate "what we decided in the past" with "what is
  true now." Stays readable (public repo, GitHub MCP can fetch) but
  not part of the four-layer precedence chain.

---

## KB changes shipped

- `unicorn-kb @ f09944c` — Clean Architecture proposal
  follow-ups: source-of-truth row added for refactor proposal;
  `<codebase>/docs/` rule relaxed (Path A) with new "which owns what"
  section explaining the boundary; hedged forward note added in
  `pinned/conventions.md → Role-aware rendering` pointing at the
  proposal. Branch `kb/clean-arch-proposal-followups`.
- `unicorn-kb @ 185d5b3` — audit-repo reality:
  `kb-hygiene.md` corrected ("not team-visible" → "readable to anyone in
  the org", `audits/` → `audit/`, audit explicitly noted as outside
  source precedence); `team-roles.md` access matrix split into
  read/write rows. Branch `kb/audit-repo-reality`.
- `unicorn-audit @ d5a0976` — repo self-reconciliation:
  README + CLAUDE.md + INDEX.md updated to use `audit/` (singular);
  INDEX broken link fixed; CLAUDE.md session-end ritual updated to
  PR-based flow matching workspace-root; this audit appended to INDEX.
  Branch `audit/repo-self-reconciliation`.
- Workspace-root `CLAUDE.md` — applied loose (workspace root is
  unversioned, no PR/SHA). Audit row in GitHub repos table updated to
  point at `ComplyHub-ai/unicorn-audit` instead of `_(local only)_`.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ cf8d1314` — HEAD per the proposal's own
  survey note. NOT re-verified this session — the proposal review
  trusted the survey rather than re-walking the tree.
- `<codebase>/docs/` — directory listing fetched via GitHub MCP. 23
  files + 3 subdirs as enumerated above.
- `ComplyHub-ai/unicorn-audit` — verified to exist, public, default
  branch `main`, `audit/` directory containing two prior entries
  (`2026-04-24-kb-restructure.md`, `2026-04-27-codebase-week-review.md`).

---

## Decisions

- **Path A on `<codebase>/docs/`** — relax the rule to acknowledge
  reality. Boundary becomes: "if Lovable benefits from reading it
  during a prompt, it goes in `<codebase>/docs/`; if it would distract
  Lovable or only humans/Carl care, it goes in `unicorn-kb/`."
  Reasoning: most existing files genuinely help Lovable mid-prompt;
  pinned KB already cites them as authoritative; Slice 2 of the
  refactor proposes adding `src/ARCHITECTURE.md` for the same reason;
  Path B (enforce) would unwind too much and gain too little.
- **Audit repo NOT in source precedence.** Confirmed via Carl. Audit
  becomes "readable historical context" — available to fetch via
  GitHub MCP but not part of the four-layer routing chain.
- **`audits/` → `audit/` resolved by updating docs to match disk**, not
  the reverse. Source-precedence rule (codebase/disk wins) applied.
- **Sub-repo CLAUDE.md conforms to workspace-root**, not the other way.
  Workspace-root has authority for cross-repo session rituals.
- **Audit-trail ownership = Carl.** Confirmed this session. PR 3 fixes
  the live drift in `unicorn-audit/CLAUDE.md`; the historical reference
  in `audit/2026-04-24-kb-restructure.md` stays unchanged per the
  point-in-time audit-immutability rule.
- **conventions.md `can.ts` pointer queued behind Slice 1.** Hedged
  forward note lands now; full pointer waits for Slice 1 to merge so
  the KB doesn't reference fictional code.

---

## Open questions parked

- **`<codebase>/docs/TGA_SECRETS.md` contents.** Verify it does not
  contain actual secrets. If it does: rotate, then delete. Treat as
  separate incident, not part of this audit's reconciliation.
- **Stale "Angela" references in `audit/2026-04-24-kb-restructure.md`.**
  Decisions section calls the audit repo "Angela's audit trail."
  Ownership confirmed Carl this session; PR 3 fixed
  `unicorn-audit/CLAUDE.md`. Historical audit entries left unchanged
  per the "audit docs are dated point-in-time records, never updated"
  rule (`unicorn-kb/pinned/kb-hygiene.md → Freshness policy`). Future
  readers should treat "Angela" in 2026-04-24 as a known stale
  reference resolved on 2026-04-28.
- **Slice 1 follow-up.** When Slice 1 of the Clean Architecture
  refactor merges, replace the hedged forward note in
  `pinned/conventions.md → Role-aware rendering` with the full pointer
  to `src/domain/access/can.ts`.
- **Refactor promotion.** If the proposal becomes committed direction
  (Slice 2 ESLint rule lands and Lovable respects it), promote to an
  ADR in `reference/decision-trail.md` and a row in
  `pinned/decisions.md`.
- **`<codebase>/docs/` boundary stress test.** Re-evaluate in 6 months
  (call it 2026-10-28). If Lovable starts dumping inappropriate
  material in there (audit reports, brainstorm content, anything
  human-only), tighten the rule.
- **`<codebase>` HEAD assumption.** This audit trusted `cf8d1314` from
  the proposal's survey. If the audit-repo decisions need to be
  re-grounded later, re-verify HEAD first.
- **Three-repo architecture ADR never written.** The 2026-04-24
  restructure audit's Decisions section says "Full ADR to draft in
  `unicorn-kb/reference/decision-trail.md`" for the three-repo split.
  No such ADR appears to exist; `pinned/decisions.md` shows zero open
  decisions. Either it was written elsewhere or it slipped. Worth
  confirming and either drafting or marking as a tombstone.

---

## Tag

`audit-2026-04-28`
