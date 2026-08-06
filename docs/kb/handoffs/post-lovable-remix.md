# Handoff: Post-Lovable-Remix Reconciliation

> **Last updated:** 2026-04-24 · **Reconsider by:** 2026-07-24 · **Confidence:** medium.
>
> Lovable did a remix. The `<codebase>/` repo is now pointed at a new codebase
> (or the existing one is structurally different enough to be treated that
> way). KB references to file paths, modules, and as-shipped architecture
> are now suspect until reconciled. `codebase-state/*` is the most affected
> layer — it describes code that may no longer exist.
>
> **Applies to:** Carl only.

---

## Why this exists

Per `../pinned/kb-hygiene.md`: `unicorn-kb/codebase-state/*` describes
the shipped code. When the code structurally changes, those files are
instantly stale. The KB proper (`pinned/`, `reference/`) avoids literal
file paths for this reason, but ADRs sometimes reference specific code
shapes that may no longer apply.

A remix is the one trigger that **always** gets an audit entry.

---

## Before the remix

Ideally, announce the remix to the team so commits to `<codebase>/` pause
briefly. Then:

1. `cd ~/repository/unicorn-workspace/<codebase> && git log --oneline -5` — note the pre-remix HEAD
   SHA. You'll reference it in the audit doc.
2. `cd ~/repository/unicorn-workspace/unicorn-kb && git log --oneline -5` — note the KB HEAD SHA
   too, for the audit record.
3. Ensure both repos are clean (no uncommitted local changes).

---

## The remix

Lovable runs the remix. New repo URL, or overwritten existing repo.
Follow whatever Lovable's flow is for this — not covered here.

Once the remix is done:

```bash
cd ~/repository/unicorn-workspace
rm -rf <codebase>    # nuke the stale clone (current dirname from root CLAUDE.md)
git clone <new-repo-url> <new-dirname>
# Update the <codebase> alias in ~/repository/unicorn-workspace/CLAUDE.md to <new-dirname>
cd <new-dirname>
git log --oneline -5   # note the post-remix HEAD SHA
```

---

## Regenerate `unicorn-kb/codebase-state/`

Open Claude Code at `~/repository/unicorn-workspace/` (sees all three repos). Run:

> The <codebase>/ repo was just remixed by Lovable. Regenerate
> unicorn-kb/codebase-state/ from the current codebase:
>
> 1. codebase-state/module-status.md — what's built, what's partial, what's
>    missing. Use the format from the previous version as a guide.
> 2. codebase-state/codebase-map.md — where things live, file paths for
>    major modules.
> 3. codebase-state/architecture.md — as-shipped system architecture, edge
>    functions, tables, flows.
>
> Read the actual <codebase>/ codebase to populate these. Don't trust any
> prior codebase-state content about paths. Reference ../pinned/kb-hygiene.md
> and ../pinned/conventions.md for format conventions.
>
> Each file must carry a header with:
> - Last updated: <today>
> - Reconsider by: (leave as "next Lovable remix")
> - Confidence: high
> - Reflects commit: <codebase>@<post-remix HEAD SHA>

Review the generated docs. Branch in `unicorn-kb`:

```bash
cd ~/repository/unicorn-workspace/unicorn-kb
git checkout -b remix/YYYY-MM-DD-regenerate-codebase-state
# (Claude Code wrote the files; review the diff)
git add codebase-state/
git commit -m "remix: regenerate codebase-state from <codebase>@<sha>"
git push
# Open PR, self-review, merge
```

---

## Reconcile the rest of the KB

For each `pinned/` and `reference/` file, ask: does the remix invalidate
anything this file asserts?

Particular attention:
- `pinned/conventions.md` — do the documented patterns still match the
  shipped code? RLS shape, auth flow, form patterns.
- `reference/flow-patterns.md` — do the flows still work the way
  documented?
- `reference/decision-trail.md` — are any ADRs now architecturally
  obsolete? Mark superseded, don't delete.
- `reference/migration-1to2.md` — the 1.0 → 2.0 mapping may shift.
- `pinned/decisions.md` — any Open Decisions implicitly resolved (or
  re-opened) by the remix?

In claude.ai chat (Unicorn 2.0 project):

> I just regenerated codebase-state/ from a Lovable remix. The new
> <codebase>/ HEAD is <SHA>. Based on the new codebase-state and the pinned
> KB you have, tell me which pinned or reference files need updating,
> and produce ready-to-paste text for each.

Apply the updates via PR against `unicorn-kb:main`.

---

## Write the audit doc

In `unicorn-audit/`, create `audits/YYYY-MM-DD-post-remix.md`. Use the
template in `unicorn-audit/README.md`. Must include:

- Pre-remix `<codebase>/` HEAD SHA
- Post-remix `<codebase>/` HEAD SHA
- `codebase-state/` regenerated — the `unicorn-kb/` commit SHA
- Other KB changes — list each `unicorn-kb` PR + SHA
- Superseded ADRs (with numbers)
- Open questions / things you noticed but didn't action this time
- Tag: `remix-YYYY-MM-DD`

Commit the audit doc, tag the commit:

```bash
cd ~/repository/unicorn-workspace/unicorn-audit
git add audits/YYYY-MM-DD-post-remix.md INDEX.md
git commit -m "remix: reconcile KB against <YYYY-MM-DD> Lovable remix

<codebase> pre-remix: <SHA>
<codebase> post-remix: <SHA>
unicorn-kb codebase-state: <SHA>
unicorn-kb other changes: <PR numbers or SHAs>"
git tag remix-YYYY-MM-DD
git push && git push --tags
```

---

## Communicate

Post to the team (wherever team comms happen):
- Remix completed, commits to `<codebase>/` resume.
- Links to the PRs in `unicorn-kb/` that updated the KB.
- Flag any changes that affect how devs work (new patterns, superseded
  ADRs).

---

## Common pitfalls

- **Trusting the old `codebase-map.md`.** File paths are the first
  casualty of a remix. Regenerate before answering any "where does X
  live" question.
- **Skipping the Reflects-commit SHA update.** Without it, staleness
  detection breaks. Every regenerated `codebase-state/*` file must
  carry the new SHA.
- **Skipping the ADR supersession pass.** Some ADRs are about
  architectural shape; if the shape changes, those ADRs are now wrong.
  Mark superseded, don't leave silently stale.
- **Forgetting to tag.** The tag is what makes the audit doc findable
  later via `git tag --list "remix-*"`.
- **Not pausing team commits.** Devs committing to `<codebase>/` mid-remix
  creates merge headaches you didn't need.
- **Committing codebase-state changes to the wrong repo.** They live in
  `unicorn-kb/`, not `<codebase>/`. Easy to get wrong when Claude Code is
  open at the parent directory and can edit both.
