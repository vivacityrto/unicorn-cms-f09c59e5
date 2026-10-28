# Rock hierarchy and milestone mapping

> **Last updated:** 2026-10-28 · **Reconsider by:** 2027-01-28 · **Confidence:** high on the rules (read from the migrations and the editor code, and checked against production data on 28 Oct 2026).
>
> **Status:** the Link action described under "What changed" is built and in a pull request. The "Open decisions" are not decided.

## The rules, in one place

| Question | Answer | Where it is enforced |
| --- | --- | --- |
| Can a Company Rock stand alone? | **Yes.** It is the top; it cannot have a parent. | `upsert_rock_with_parenting` |
| Can a Team Rock stand alone? | **The editor says no, the database allows it.** The editor asks a Team Rock to serve a Company Rock. But Team Rocks the system creates itself (a client's "Client Rock" is made automatically when an Individual Rock is saved for that client and function) are created with **no parent**. In Q4 2026 production, 2 of 3 Team Rocks have no Company parent: the auto-created "Client Rock – Altaira Education" and "Client Rock – Melloz Services", which have no Individual Rocks under them yet. The third Team Rock was made by hand and does serve a Company Rock. | editor `rules.ts`; the auto-create in `upsert_rock_with_parenting` |
| Can an Individual Rock stand alone? | **The editor says no** ("Choose the Company or Team Rock this serves"). The database does not require a parent, so a legacy or scripted one could exist; production has none in Q4 2026. | editor `rules.ts` |
| Which Rock can an Individual Rock serve? | A **Company or Team** Rock, in the **same quarter**, in the same tenant, not archived, and (for a client Rock) the same client. | `upsert_rock_with_parenting` |
| Which Rock can a Team Rock serve? | A **Company** Rock, same quarter. | same |
| Can an Individual milestone be linked to a milestone above it? | **To a Company Rock's milestone, yes.** The Individual Rock must serve that Company Rock directly, or through a Team Rock that serves it. | `validate_eos_rock_milestone_link` (trigger on `eos_rock_milestone_links`) |
| To a **Team** Rock's milestone? | **No.** | same trigger: the upper end must be a Company Rock's milestone |
| Can a **Team** Rock's milestones be linked up to a Company milestone? | **No.** Only an Individual Rock's milestones are link ends. | same trigger |
| Can one Individual milestone support several Company milestones? | **Yes**, and a Company milestone can have several Individual milestones behind it (many to many). | primary key `(company_milestone_id, individual_milestone_id)` |

Consequence: an **Individual Rock under a Team Rock that has no Company parent cannot map its milestones anywhere**, because there is no Company Rock above it. Nothing is in that position today (every Individual Rock in Q4 2026 serves a Company Rock directly or through a Team Rock that does), but it is what would happen to the first Individual Rock saved under one of the auto-created client Team Rocks.

*Correction (28 Oct 2026):* an earlier version of this page said the two Individual Rocks under Team Rocks sat under standalone client Team Rocks. That was wrong: they sit under the hand-made Team Rock that serves a Company Rock, and can map normally.

## Why a Team Rock can appear under a Company Rock, and another not

"Standalone" only means a Team Rock has no parent; it says nothing about whether it is in the meeting's scope. A Team Rock that serves a Company Rock is shown under it in the cascade and in the Company Rock's Individual Rocks view (through its Individual Rocks). A Team Rock with no parent is not shown under any Company Rock; it stands as its own top-level row in the Team list and in the meeting's Rock Review, because the meeting's scope is chosen by level (for example Company and Team), not by parentage.

## What "unmapped" means

An Individual milestone is *unmapped* when it has no link to any Company milestone of the Company Rock it serves. It is a flag, not an error: nothing blocks the Rock. Completed and deferred milestones are never flagged. In Q4 2026 production: 54 Individual milestones, 42 mapped, 12 unmapped (11 of them open), and every one of the 12 Individual Rocks has a Company Rock with milestones available to map to. So the mapping was possible in all those cases, but the only place to do it was the Rock editor, and the warning itself offered no way to act.

## What changed

- **Link from where the warning is.** In the Company Rock's **Individual Rocks** view (on the card and in the Rock details; the meeting's Discuss view, [rock-review-discuss.md](rock-review-discuss.md), shows the same section with the same Link action), an unmapped milestone now has **Link to a Company milestone**, and a mapped one has **Change**. In the Rock details of an Individual Rock, each milestone's details have the same action. It opens a picker of the Company Rock's milestones (tick any number; leave all unticked to stay unmapped). Changes are saved together; the database re-checks each pairing, so a refused pairing shows its message and nothing is lost.
- **Individual Rocks under a Team Rock now appear in their Company Rock's view**, labelled "via the Team Rock …". They were invisible there before, although the database counts them as serving the Company Rock. A Company Rock whose only children are Team Rocks now gets the section too.
- **A dead end explains itself.** When an Individual Rock serves nothing, or serves a Team Rock that is not under a Company Rock, the milestone details say exactly that and offer **Edit this Rock** (where the parent is chosen) instead of a Link button that could not work.
- No database change, no migration: the existing links table already lets signed-in staff add and remove links, and the trigger validates them.

## Open decisions (not made, with a recommendation)

1. **Client Team Rocks are created with no Company parent.** Today this strands nothing (no Individual Rock sits under the two that exist), but it will the first time one does. Recommendation: when one is auto-created, attach it to a Company Rock chosen for that team and quarter (or prompt for it), and give the existing standalone ones a parent. Needs a decision on *which* Company Rock; it is a change to `upsert_rock_with_parenting`, so a migration, audit entry and separate approval.
2. **"This supports the Rock as a whole, not one Company milestone."** Some Individual milestones are legitimately enabling work, so the unmapped flag will nag. Recommendation: a per-milestone choice that clears the flag. It needs a stored value (a column on `eos_rock_milestones`), so a migration, and a product decision on whether "unmapped" should ever be acceptable.
3. **Team Rock milestones cannot link up.** Only two Team Rock milestones exist in Q4 2026, so there is little demand. Recommendation: leave it unless Team Rocks start carrying real milestones; supporting it means changing the link trigger and the table's meaning.

## Observation, not part of this change

`eos_rock_milestone_links` carries the default Supabase table privileges for `anon` (insert, update, delete and so on). Row level security has no policy for `anon`, so those calls are refused, but the grants are wider than the table needs. Worth tightening with a migration when convenient; it is not exploitable on its own.

Related: [rock-blockers-and-carryover.md](rock-blockers-and-carryover.md) (the Individual Rocks view and carryover).
