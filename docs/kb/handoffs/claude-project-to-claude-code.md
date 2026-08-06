# Handoff: Claude Project → Claude Code

> **Last updated:** 2026-04-24 · **Reconsider by:** 2026-07-24 · **Confidence:** medium (procedure new, will iterate).
>
> You were brainstorming in claude.ai. A decision emerged, or a design
> crystallised, or a change needs to be made. Now you need to carry that out
> of chat into either the codebase or the KB without losing the context.
>
> **Applies to:** Carl, RJ, Khian.

---

## Before closing the chat

Ask Claude (in that chat) for a **handoff summary**:

> Produce a handoff summary for a Claude Code session. Include: (1) the
> decision reached, (2) which repo(s) need to change, (3) which files,
> (4) any open questions I still need to resolve, (5) references to the
> KB files we cited. Keep it under 300 words.

Copy that summary. That's what you'll paste into Claude Code.

---

## Open Claude Code

Open at `~/repository/unicorn-workspace/` (workspace root — contains `<codebase>/`, `unicorn-kb/`, `unicorn-audit/`)
so Claude Code can see all three repos.

Paste the summary. Ask Claude Code to scope the work:

> Given this summary, tell me: which repos will be touched, which files,
> whether anything crosses repo boundaries. Don't start editing yet.

Read the scope. Correct it if Claude Code misread anything.

---

## Execute

**If only `unicorn-kb/` changes:**
1. `cd unicorn-kb && git checkout -b <branch-name>`
2. Let Claude Code edit the files.
3. Review the diff yourself. RLS-adjacent content → RJ reviews.
4. Commit, push, open PR against `unicorn-kb:main`, merge.

**If only `<codebase>/` changes:**
1. Flag: is this something Lovable should be doing instead?
2. If yes, stop here — this is a Lovable job, not a hand-edit.
3. If no (hotfix, security fix, doc-only change to `<codebase>/docs/*`):
   branch, commit, review, PR, merge.

**If both repos change:**
1. Edit each on its own branch in its own repo. Never cross-commit.
2. In the commit message of the second one, reference the first by SHA.
3. Consider whether this is material enough to record in the audit repo
   (see below).

---

## Record in the audit repo (conditional)

**Lovable production DB change sessions** have a mandatory audit entry — authored by the dev who ran the session. See `unicorn-kb/handoffs/lovable-production-db-change.md → After deploy`.

For all other session types (Carl-authored), open an audit doc if the change:
- Resolves an Open Decision.
- Introduces or supersedes a convention.
- Reconciles a divergence between KB and codebase.
- Is anything future-you will want to find with `git log --grep`.

Skip the audit repo for routine edits, typo fixes, or re-dates.

See `unicorn-audit/CLAUDE.md` for audit session rituals.

---

## Common pitfalls

- **Losing the "why" in the handoff.** The summary should include the
  reasoning, not just the what. Future-you (or a teammate reading the PR)
  will need the why.
- **Editing across repos in one commit.** Don't. Keep commits atomic per
  repo. Cross-reference via SHAs in commit messages instead.
- **Skipping the KB update.** If the chat surfaced a new convention or
  decision, the KB needs it even if no code changed. Double-check nothing
  slipped before closing the session.
- **Treating Claude Code's scope read as truth.** It works from the summary
  you pasted; if your summary was incomplete, so is its scope. Re-read.
