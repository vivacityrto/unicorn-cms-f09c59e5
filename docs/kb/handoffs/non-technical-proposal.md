# Handoff: Non-Technical KB Proposal

> **Last updated:** 2026-04-27 · **Reconsider by:** 2026-07-27 · **Confidence:** medium (new flow, iterate). 2026-04-27: re-pitched intro to explicitly name the Non-technical KB reader seat from the seat-centric restructure.
>
> You have a KB proposal — something that should be recorded, changed, or
> added — but you don't use git or Claude Code. This handoff exists so
> your proposal doesn't get lost and you don't have to learn a toolchain
> to contribute.
>
> **Applies to:** the **Non-technical KB reader** seat (see `pinned/team-roles.md`) — new hires before commit access, external reviewers / consultants Angela brings in, and any other reader without commit access.

---

## The inbox

There is **one designated Claude Project chat thread** used as the KB
proposal inbox. It's a write-only paste surface — not for conversation,
not for back-and-forth debate, just for recording proposals.

**Inbox chat thread URL:** _(set by Carl on setup — paste the URL here
once the thread exists, then bookmark it)_

If you aren't sure what the URL is, ask Carl. Don't open a new thread
for proposals — one inbox is the point.

---

## What to paste

Use this format. One proposal per paste.

```
[YYYY-MM-DD]
Proposed change: <one sentence — what should be different>
Why: <one or two sentences — what problem this solves>
Which file: <best guess at the KB file, or "not sure">
Context: <anything else Carl needs to make the call — links,
          screenshots description, quotes, examples>
Your name: <so Carl can follow up if it's unclear>
```

Example:

```
[2026-04-24]
Proposed change: Add a convention that all new customer-facing emails
must be previewed by the content team before send.
Why: Two emails went out last week with stale pricing language.
Which file: not sure — maybe conventions.md or a new content-review file
Context: See the stale-pricing incident from 2026-04-20.
Your name: Jane
```

---

## What happens next

Carl checks the inbox thread on her review cadence (ad-hoc, see
`pinned/kb-hygiene.md → Review cadence`). For each proposal:

1. If the change is clear and right → Carl opens a PR against
   `unicorn-kb/` with the change + your proposal quoted in the PR
   description, merges, done.
2. If the change needs discussion → Carl replies in the inbox thread
   with a link to wherever the discussion moves (a separate thread, a
   meeting agenda item, etc.).
3. If the change is already covered, contradicts an existing decision, or
   doesn't belong in the KB → Carl replies in the inbox thread
   explaining why. Nothing is silently rejected.

You'll see the reply in the inbox thread. You don't need to track PRs or
commits.

---

## What belongs here vs doesn't

**Belongs:**
- Conventions you think should exist.
- Decisions you think have been made but aren't recorded.
- Glossary entries for terms the team uses but hasn't written down.
- Flow or process documentation that should be added.
- Corrections — "the KB says X but we actually do Y."

**Doesn't belong:**
- Product feature requests (those go to wherever product requests live —
  not the KB).
- Bug reports.
- Questions about how to use the product (ask in team chat).
- Questions you could answer yourself by asking Claude in the project.
  Use the project chat for that; this inbox is for proposals, not
  questions.

---

## Inbox hygiene

Carl archives or clears the inbox thread periodically — old replied-to
proposals can be removed, thread can be reset if it gets long. Replies
stay long enough for the proposer to see them, not forever. If you need
a permanent record of something proposed here, the PR Carl opens from
your proposal is the permanent record.
