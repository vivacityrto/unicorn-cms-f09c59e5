# Engineering Cadence

> **Last updated:** 2026-04-27 · **Reconsider by:** 2026-07-27 · **Confidence:** medium — review-gate claims corrected 2026-04-27 to match operating-model ADR-011; some sections (recent themes, roadmap buckets) remain inferred from git log and may be stale. Estimating section assumes hand-written code; Lovable estimates differ.
>
> The engineering team's working rhythm on Unicorn 2.0, the current roadmap, and the shape of what's in flight. Vivacity runs on EOS, so the engineering team uses the same vocabulary — Rocks, To-Dos, Issues, IDS — rather than Scrum sprints. This doc reflects that.

---

## Cadence (EOS-aligned)

- **Weekly cycle:** the EOS Level 10 Meeting on Monday morning AEST is the kickoff. Engineering To-Dos are committed/reviewed there.
- **Quarter:** Engineering Rocks are 90-day priorities owned by individuals. Reviewed each L10.
- **Quarterly Conversations:** drive the next quarter's Rocks (engineering + product).

The "sprint" framing isn't used here — the unit of planning is the **week** (To-Dos) inside the **quarter** (Rocks). That gives:
- **Engineering Rocks** — quarterly projects (e.g. "Ship EOS live meeting v1", "Complete Audits MVP")
- **Engineering To-Dos** — weekly commitments out of the L10
- **Engineering Issues** — blockers / debates identified during the meeting, worked through IDS

---

## How engineering work gets tracked

Primary artifacts:

1. **GitHub commits / PRs** — source of truth for code changes. Commit messages are concise and imperative.
2. **EOS module itself** — Rocks (quarter), To-Dos (week), Issues (team blockers). The engineering team is a tenant user like any other.
3. **Lovable project board** — visible to RJ; may drift from GitHub.
4. **Ad-hoc conversation** — Slack/Teams for micro-decisions.

**Gap:** There's no issue tracker like Linear/Jira currently wired in. If that changes, add a note in [05-product-decisions.md](05-product-decisions.md).

---

## Recent themes (from git log — last 2 weeks)

- **Auth & Super Admin** — password reset validation, admin-change-password hardening, auth user check. Most commits.
- **UI polish** — input font sizing, online status indicators, cross-module card styling.
- **Bug fixes** — nested tenant query types, a revert to an earlier stable commit.

Read the signal: this isn't a net-new-features week, it's stabilisation work. Don't barge in with a big refactor.

---

## Roadmap buckets

### Now (current quarter)
- Super Admin tooling polish
- Auth edge cases (reset, invite, session)
- EOS module stability
- Audit module gaps (understand scope)

### Next (this quarter or start of next)
- Subscription portal (Stripe) — pending decisions in [05-product-decisions.md](05-product-decisions.md#open-decisions)
- Campaign engine decision (build / buy / defer)
- Client portal architecture decision
- Tighten edge function error codes across all functions (pattern established in `invite-user`, not consistent elsewhere)
- Pragmatic Clean Architecture refactor — pilot via Lovable on Lifecycle Checklists slice. Plan: [clean-architecture-refactor.md](clean-architecture-refactor.md)

### Later
- ~~Outlook calendar sync~~ ✅ **Shipped**
- ~~SharePoint~~ ✅ **Shipped**
- Expanded AI agents (pattern + one real use beyond `ai-generate-suggestions`)
- Tablet / focus mode for EOS meetings

### Not now (explicitly deprioritised)
- Mobile app (web-responsive is the plan)
- Google Calendar (lower priority than Outlook)
- On-prem deployment (not in scope)

---

## Work intake checklist

When picking up a ticket:

1. **Is the goal clear?** If not, write the acceptance criteria down before touching code.
2. **Does it affect the data model?** If you're hand-writing it, write the migration deliberately — there is no review gate (see `decision-trail.md → ADR-011`). If Lovable is generating it, the migration lands automatically; flag anything risky in `brainstorm-log.md` post-merge.
3. **Does it involve an AI call?** Must be an edge function. No exceptions.
4. **Does it touch RLS?** Apply the three-step ritual (`pinned/conventions.md → New table checklist`). Lovable-generated migrations may or may not include all three steps; check post-merge.
5. **Does it add a page?** Follow the Wrapper convention. Add the route to `App.tsx` **above** the catch-all.
6. **Does it add a third-party dependency?** Check existing deps first; if genuinely needed, record the decision.
7. **Is there a test plan?** Even a manual one. UI work in Lovable is easy to regress. For any data-fetch or optimisation change: run the blast-radius check first, scope the Lovable prompt explicitly, and run the post-pull checklist before marking done. See [reference/dev-guardrails.md](dev-guardrails.md).

When closing a ticket:

1. **Does the PR description explain the *why*, not just the *what*?**
2. **If this is a new convention, did it land in `pinned/conventions.md`?**
3. **If this reversed a prior decision, did it land in `pinned/decisions.md` + `reference/decision-trail.md`?**

---

## Pre-meeting prep for Level 10s

Before Monday:

- Glance at open GitHub PRs (yours + Khian's)
- Review Scorecard metrics in `/eos/scorecard`
- Add any new Issues to the Issues list (`/eos/issues`) so they're in the IDS queue
- Make sure your To-Dos from last week are updated — done, not done, or reassigned
- Skim recent commits for things worth mentioning in Rock reviews

---

## Estimating work on this codebase

Rules of thumb:

- **Frontend-only ticket:** Lovable prompt + cleanup. Half a day to two days.
- **New table / migration:** Half a day for design, half a day for RLS + trigger + seed + review.
- **New edge function:** A day (boilerplate + auth + logic + error codes + client integration).
- **AI workflow:** Budget 2–3x what you think — prompt engineering + eval eats time.
- **RLS debugging:** It's the three-step ritual. Verify each step explicitly before assuming anything.

---

## What to escalate vs. decide yourself

**No synchronous gate exists today** (see `decision-trail.md → ADR-011`). For decisions that warrant deliberation rather than just being dropped into Lovable:

- Schema changes affecting cross-tenant access patterns
- Security-sensitive flows (auth, invites, role changes)
- Hardcoded constants beyond `6372 = Vivacity`
- Anything that touches production data destructively

**Path:** flag in `reference/brainstorm-log.md` or open an Issue in EOS, and tag Carl. Lovable-generated changes that fall in these categories also land — flag them post-merge so the team is aware.

**Decide yourself:**
- Component structure (following existing conventions)
- Query key naming (following existing conventions)
- Minor UX choices
- Test approach
- PR scope / splitting

When in doubt: check `pinned/decisions.md → Open Decisions`. If it's there, it's not yet decided — don't get ahead of it.

---

## Shipping discipline

- No force-pushing to `main` (humans/Claude Code; Lovable's direct-to-`main` is the one authorized exception).
- Don't amend merged commits.
- Pre-commit hooks exist — don't bypass them with `--no-verify`.
- There is no RLS sign-off gate today (see `decision-trail.md → ADR-011`). When hand-writing migrations via Claude Code, self-review the three-step ritual against `pinned/conventions.md → New table checklist`. Lovable-generated migrations land without review.
- UI changes should be smoke-tested in a browser before marked done.

---

## Definitions of done (per work type)

| Work type | Done means |
|---|---|
| UI feature | Browser-tested golden path + one edge case. No mandatory code review per ADR-011 — self-review applies. |
| Edge function | Deployed, invocation tested from the frontend, all error codes documented in [docs/INVITE_USER_DIAGNOSTICS.md](../docs/INVITE_USER_DIAGNOSTICS.md) or equivalent |
| Schema change | Migration merged, RLS verified enabled (when hand-written), dependent features still work. No sign-off gate per ADR-011. |
| Bug fix | Root cause identified (not just symptom patched), regression test or documented repro |
| Docs / convention update | Landed in the right `unicorn-kb/` file |

---

## Open process questions

- How are we tracking design debt? Currently: Issues in the EOS board. Is that sustainable?
- Is there a staging environment? (Open decision — see `pinned/decisions.md → Open Decisions`.)
- When do we start enforcing test coverage? Currently: none.
- Should we adopt a lightweight issue tracker (Linear) for engineering work not suitable for EOS Issues?
