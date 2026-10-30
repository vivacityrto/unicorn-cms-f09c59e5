# Rock hierarchy and milestone mapping

> **Last updated:** 2026-10-30 · **Reconsider by:** 2027-01-28 · **Confidence:** high on the rules (read from the migrations and the editor code, and checked against production data on 28 Oct 2026).
>
> **Status:** the Link action under "What changed" is merged (PR 1466). Linking through a Team Rock (30 Oct 2026, Carl chose the full chain) is built in a pull request; its migration is **applied to `unicorn-qa` and production (30 Oct 2026)**; the rule was also checked on `unicorn-qa` in a rolled-back transaction (17 pairings, old rule and new, all as expected; see the audit entry). The "Open decisions" below are updated for it.

## The rules, in one place

| Question | Answer | Where it is enforced |
| --- | --- | --- |
| Can a Company Rock stand alone? | **Yes.** It is the top; it cannot have a parent. | `upsert_rock_with_parenting` |
| Can a Team Rock stand alone? | **The editor says no, the database allows it.** The editor asks a Team Rock to serve a Company Rock. But Team Rocks the system creates itself (a client's "Client Rock" is made automatically when an Individual Rock is saved for that client and function) are created with **no parent**. In Q4 2026 production, 2 of 3 Team Rocks have no Company parent: the auto-created "Client Rock – Altaira Education" and "Client Rock – Melloz Services", which have no Individual Rocks under them yet. The third Team Rock was made by hand and does serve a Company Rock. | editor `rules.ts`; the auto-create in `upsert_rock_with_parenting` |
| Can an Individual Rock stand alone? | **The editor says no** ("Choose the Company or Team Rock this serves"). The database does not require a parent, so a legacy or scripted one could exist; production has none in Q4 2026. | editor `rules.ts` |
| Which Rock can an Individual Rock serve? | A **Company or Team** Rock, in the **same quarter**, in the same tenant, not archived, and (for a client Rock) the same client. | `upsert_rock_with_parenting` |
| Which Rock can a Team Rock serve? | A **Company** Rock, same quarter. | same |
| Can an Individual milestone be linked to a milestone above it? | **To a Company Rock's milestone, yes.** The Individual Rock must serve that Company Rock directly, or through a Team Rock that serves it. | `validate_eos_rock_milestone_link` (trigger on `eos_rock_milestone_links`) |
| To a **Team** Rock's milestone? | **Yes, from 30 Oct 2026 (the migration is applied; the screens ship when the pull request merges).** The Individual Rock must serve that Team Rock directly. | same trigger |
| Can a **Team** Rock's milestones be linked up to a Company milestone? | **Yes, from 30 Oct 2026 (the migration is applied; the screens ship when the pull request merges).** The Team Rock must serve that Company Rock. | same trigger |
| Any other pairing (Individual to Individual, Team to Team, anything downward, a Rock that does not serve the other)? | **No.** The database refuses it. | same trigger |
| Can one Individual milestone support several Company milestones? | **Yes**, and a Company milestone can have several Individual milestones behind it (many to many). | primary key `(company_milestone_id, individual_milestone_id)` |

Consequence (before the Team chain): an **Individual Rock under a Team Rock that has no Company parent could not map its milestones anywhere**, because there was no Company Rock above it. Nothing was in that position (every Individual Rock in Q4 2026 serves a Company Rock directly or through a Team Rock that does), but it is what would have happened to the first Individual Rock saved under one of the auto-created client Team Rocks. With the Team chain it can now map to that Team Rock's milestones, so it is no longer a dead end (it still has no Company milestone to reach until the Team Rock is given a Company parent).

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

## Linking through a Team Rock (30 Oct 2026)

Carl asked whether an Individual Rock can link to a Team Rock "like the milestones and everything", and chose the **full chain**: Individual milestone to Team milestone to Company milestone. The Rock-level link already existed (an Individual Rock serves a Team Rock through its parent); this adds the milestone-level links.

- **The rule** (`validate_eos_rock_milestone_link`, migration `20261030010000_rock_milestone_links_team_chain.sql`): three pairings are allowed. Individual to Company (directly or through a Team Rock, unchanged, so every stored link stays valid), Individual to Team (the Rock must serve that Team Rock), and Team to Company (the Team Rock must serve that Company Rock). The table and its column names are unchanged; `company_milestone_id` simply means "the milestone being supported", whichever level it is.
- **The picker** (Link / Change) now lists the milestones of the Rocks above, grouped by Rock: the Team Rock first, then the Company Rock. A Team Rock's own milestones get the same action in the Rock details, to link up to the Company Rock.
- **The Rock editor** offers the same groups under each milestone, and keeps Team links when it saves. Before this, saving an Individual Rock there would have deleted any link it did not know about, so the editor change is what makes the feature safe.
- **The Individual Rocks view** shows a milestone supported only through the Team Rock as mapped, labelled "Team", and counts a Team milestone that supports a Company milestone as coverage of it.
- **Choices confirmed by Carl on 30 Oct 2026** (still reversible if that changes): (1) an Individual milestone linked only to a Team milestone counts as *mapped*, so it is no longer flagged; (2) there is **no automatic roll-up through the chain**: a Company milestone's delivery counts the milestones linked to it directly (a Team milestone, or an Individual one), not the Individual milestones behind a Team milestone; (3) Team milestones are never flagged as unmapped (Team Rocks can do their own work).
- **Not changed:** the Company Rock's progress roll-up, the Discuss view and the deck still read direct links only.

## Open decisions (not made, with a recommendation)

1. **Client Team Rocks are created with no Company parent.** Today this strands nothing (no Individual Rock sits under the two that exist). With the Team chain, an Individual Rock under one can at least map to the Team Rock's milestones, so it is less urgent, but it still cannot reach a Company milestone. Recommendation: when one is auto-created, attach it to a Company Rock chosen for that team and quarter (or prompt for it), and give the existing standalone ones a parent. Needs a decision on *which* Company Rock; it is a change to `upsert_rock_with_parenting`, so a migration, audit entry and separate approval.
2. **"This supports the Rock as a whole, not one Company milestone."** Some Individual milestones are legitimately enabling work, so the unmapped flag will nag. Recommendation: a per-milestone choice that clears the flag. It needs a stored value (a column on `eos_rock_milestones`), so a migration, and a product decision on whether "unmapped" should ever be acceptable.
3. **Team Rock milestones cannot link up.** *Decided 30 Oct 2026: Carl chose the full chain; see "Linking through a Team Rock" above.* Still open inside it: whether a Company milestone's delivery should roll up through a Team milestone to the Individual work behind it (today it does not).

## Observation, not part of this change

`eos_rock_milestone_links` carries the default Supabase table privileges for `anon` (insert, update, delete and so on). Row level security has no policy for `anon`, so those calls are refused, but the grants are wider than the table needs. Worth tightening with a migration when convenient; it is not exploitable on its own.

Related: [rock-blockers-and-carryover.md](rock-blockers-and-carryover.md) (the Individual Rocks view and carryover).
