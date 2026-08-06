# Handoff: Lovable → Codebase

> **Last updated:** 2026-04-24 · **Reconsider by:** 2026-07-24 · **Confidence:** medium.
>
> Lovable shipped a feature. Code landed in `<codebase>/`. This handoff walks
> through pulling it in, verifying it, refreshing the affected parts of
> `codebase-state/`, and checking whether it introduces anything the rest
> of the KB needs to know about.
>
> **Applies to:** Anyone with Lovable access who's pulling changes down to
> local. Not a remix — if this is a remix, use
> [post-lovable-remix.md](post-lovable-remix.md).

---

## Pull and review

```bash
cd ~/repository/unicorn-workspace/<codebase>
git pull
```

Read what changed. Not the whole diff — the **shape** of the change. Ask:
- New tables? New columns? Any RLS policies added/changed?
- New edge functions?
- New routes in the app?
- Any new conventions introduced that aren't in `pinned/conventions.md`?
- Does it touch anything flagged as an Open Decision?

---

## Don't hand-edit `<codebase>/`

Unless it's a true hotfix (security, data corruption, production down),
hand-edits to `<codebase>/` create drift with Lovable's view of the codebase.
Next Lovable session can overwrite. Let Lovable own `<codebase>/` changes
end-to-end.

There is no `<codebase>/docs/` to maintain — codebase state lives in
`unicorn-kb/codebase-state/`, which is your repo to edit.

---

## Refresh the affected parts of `codebase-state/`

A feature ship doesn't require full regeneration (that's the remix
trigger), but the parts of `codebase-state/` that describe the affected
area are now stale.

Open Claude Code at `~/repository/unicorn-workspace/`. Paste the change summary. Ask:

> Based on these changes in <codebase>/, refresh ONLY the affected parts of
> unicorn-kb/codebase-state/:
>
> - module-status.md: update the affected module row(s)
> - codebase-map.md: add/remove/rename entries for affected routes,
>   hooks, edge functions
> - architecture.md: only if the feature added an edge function, a new
>   table, or a new flow — otherwise skip
>
> Do not regenerate the whole file; surgical edits only. Update the
> "Reflects commit" SHA in the header to the current <codebase>/ HEAD.

Review the diff in `unicorn-kb/`. Branch → commit → push → PR → merge.

---

## KB impact check (beyond codebase-state)

Open a claude.ai chat in the Unicorn 2.0 project. Paste the change
summary. Ask:

> Based on what landed in <codebase>/ in this pull, does anything in
> pinned/ or reference/ need to update? codebase-state has already been
> refreshed. Apply the "Push back and recommend an update" rule from
> pinned/kb-hygiene.md.

Common beyond-codebase-state updates:
- `pinned/decisions.md` — an Open Decision was implicitly resolved by
  the feature shipping; move to Decided.
- `reference/decision-trail.md` — the decided ADR needs its full entry.
- `pinned/conventions.md` — if a new pattern was introduced.
- `reference/flow-patterns.md` — if a new flow or altered existing flow.
- `pinned/glossary.md` — new vocabulary.

If Claude identifies updates, land them as a KB commit before closing
the session.

---

## Verify RLS if the feature touches new tables

Per `../reference/cadence.md → Shipping discipline` and
`../pinned/conventions.md`: any new table needs tenant scoping + RLS
(tenant-read SELECT + staff ALL) + explicit RLS enable. Lovable can
miss one of the three.

Run the verification from `../pinned/conventions.md → New table checklist`
against the shipped migration. If any piece is missing, **file it with
RJ before anyone uses the feature**. Missing RLS is a silent failure,
not a warning.

---

## Audit trigger (Carl-authored — reconciliation audits)

Open an audit doc in `unicorn-audit/audits/` if:
- The Lovable feature contradicts something in the pinned KB.
- RLS is missing on a new table and needed fixing.
- The feature ships differently from what the relevant ADR specified.
- You find drift that needs reconciliation.

Skip the audit repo if the feature shipped cleanly, `codebase-state/`
refresh was straightforward, and the KB was already correct about the
design.

---

## Common pitfalls

- **Skipping the codebase-state refresh.** Small feature ships feel too
  minor to touch the KB. But `codebase-state/` decays feature-by-feature
  until a remix forces full regeneration. Keeping it current between
  remixes is the whole point of the Reflects-commit SHA.
- **Regenerating the whole file instead of editing.** Surgical edits
  preserve history and keep PRs reviewable. Full regeneration is a
  remix ritual, not a feature-ship ritual.
- **Treating the pull as "just a pull."** Any Lovable feature is
  potentially a KB-affecting event. Check even if it looks routine.
- **Editing `<codebase>/` to fix a Lovable miss.** Tempting, but creates
  drift. Either raise with RJ to re-prompt Lovable, or flag the fix as
  a genuine hotfix (and log it in the audit repo).
- **Skipping the RLS check.** The most common silent failure class on
  new tables. Worth the 60 seconds every time.
