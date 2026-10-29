# To-Dos linked to Rocks and milestones

> **Last updated:** 2026-10-29 · **Reconsider by:** 2027-01-29 · **Confidence:** high on the database rules (run against `unicorn-qa` in a rolled-back transaction) and the logic (unit tests); medium on the screens (tests plus a browser walk of the new components with faked data, not the full panel on real data).
>
> **Status: built, in a pull request. The migration is applied to `unicorn-qa` and production (29 Oct 2026); the screens ship when the PR merges.**

## Why it exists

A milestone's Tasks box only ever held snapshots of GitHub issues, so a Rock whose work is not tracked in GitHub had nothing to show, and a standalone To-Do could not say which Rock it was for. The GitHub rows are static (the sync that kept them current was retired on 28 Oct 2026, see [rock-task-sync.md](rock-task-sync.md)). To-Dos are the app's own tasks (owner, due date, open or complete), so they can be linked, live, with no sync.

## What it is

- **A link from a To-Do to a Rock, or to one of that Rock's milestones.** A To-Do has at most one link ("it is for one thing"). Deleting a Rock, a milestone or the To-Do removes the link and never the other side: a To-Do whose Rock is deleted becomes standalone.
- **Rock side.** The Rock details panel shows **To-Dos for this Rock** (the Rock as a whole), and each expanded milestone shows its **To-Dos**: done count, overdue count, owner, due date, a tick box that marks the To-Do done or open again everywhere (the meeting's To-Do list included), **Add a To-Do** (title and date, owned by you, attached to the meeting when you are in one), **Link an existing To-Do**, and a small x that removes only the link ("the To-Do itself stays"). The milestone row's task figure counts these To-Dos with any linked tasks, shows "n overdue", and an open milestone with an overdue To-Do goes on the attention list. The same milestone **Linked tasks** box still shows the old GitHub rows, now labelled "snapshot as of <date>".
- **To-Do side.** On the meeting's To-Do list and the To-Dos page, each To-Do shows the Rock (and milestone) it is for, and staff get a **Link to a Rock** / **Change** control: pick a Rock (newest quarter first), optionally one of its milestones, Save; or **Make it standalone**. Linking a To-Do that is already linked moves it.
- **Discuss view.** A Rock with overdue To-Dos linked to it (itself or any milestone) shows "n To-Dos linked to it are overdue" in its flags and joins **Needs the room**. The deck is fixed when the view opens, so the filter picks the flag up as soon as the data arrives or when the filter is switched.

Progress never completes a milestone: "ready for review" is only a hint and a person decides.

## Past To-Dos in the meeting's To-Do list

The live To-Do List segment shows this meeting's To-Dos (any status) plus every still-open To-Do carried over from earlier meetings, so a finished To-Do vanished from view as soon as its meeting was over. A **Show past To-Dos (completed and cancelled)** button under the list now opens a read-only list of the tenant's completed and cancelled To-Dos from earlier meetings, newest first (up to 150, with a search box once there are more than five), each showing when it was completed or cancelled, the owner, the IDS issue it came from and the Rock it is linked to (changeable). Nothing in it changes by clicking a row: a past To-Do is put back to Open only with its **Reopen** button, after which it joins the list to review. There is no "archived" state on a To-Do; completed and cancelled are the past states. Code: `usePastTodos` in `src/hooks/useMeetingTodos.tsx`, `src/components/eos/PastTodosPanel.tsx`.

## Where the code is

Migration `supabase/migrations/20261029030000_rock_todo_links.sql` (rollback in `rollback/`): `eos_rock_todo_links` (select only for clients; a validation trigger holds "milestone belongs to the Rock" and the Rock's tenant), `add_rock_todo()`, `link_todo_to_rock()`, `unlink_todo_from_rock()` (all staff only, `SECURITY DEFINER`, empty `search_path`). Frontend: `src/utils/rockTodos.ts`, `src/hooks/useRockTodos.ts`, `src/components/eos/rocks/todos/` (`RockTodoList`, `TodoRockLink`), wired in `RockDetailSheet`, `MilestoneTable`, `LiveMeetingView`, `pages/EosTodos.tsx`, `rockDiscussion.ts` and the Discuss dialog and slide.

## Rules worth knowing

- Writes to the link table go only through the three functions. Marking a To-Do done uses the same direct update the To-Do list already uses, so the existing To-Do rules apply (including the protection for To-Dos of a completed meeting).
- A To-Do made inside a meeting lands in that meeting's tenant, like the meeting's own To-Dos; otherwise in the Rock's tenant. A To-Do may belong to a different tenant than its Rock (staff work across tenants), which is why reading a link follows the Rock's rules and reading the To-Do follows the To-Do's.
- The same title added for the same target by the same person within 30 seconds is not added twice.

## Not done

The meeting Rock Review list's attention counts (outside the Discuss view) do not yet include overdue To-Dos. A To-Do can have only one link. The old GitHub rows were not removed by this change; Carl had them cleared separately on 29 Oct 2026 after a checked backup ([audit entry](../../audit-log/entries/2026-10-29-clear-github-task-snapshots.md)), so the "Linked tasks" box no longer appears. Existing eos_todos grants and policies were not changed; note that `anon` holds table-wide grants on `eos_todos` with row level security as the only guard, which predates this work and is flagged in the audit entry.
