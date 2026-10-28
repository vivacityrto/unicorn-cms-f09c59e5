# Rock Review: the Discuss view

> **Last updated:** 2026-10-28 · **Reconsider by:** 2027-01-28 · **Confidence:** high on behaviour (tests plus a browser walk with faked data); not yet used in a real meeting.
>
> **Status: built, in a pull request. No database change.**

## Why it is shaped this way

The Rock Review segment of an EOS meeting is a yes/no check, "on track or off track", and the app's own facilitator prompt says "No discussion in Rock Review. Move discussions to IDS." So the Discuss view does **not** turn each Rock into a debate. It lets the facilitator confirm on-track Rocks in seconds, spend time only on the exceptions, record the cause, and hand anything that needs the room to IDS with its facts attached. It never tries to solve a Rock.

## What it is

A **Discuss** button in the Rock Review header opens a full-screen presentation (built to be screen-shared and readable at projector size) over the meeting. It walks the Rocks under review, the same set and order the segment shows (a Company Rock, then what cascades from it; completed Rocks are not in it), one at a time.

- **Controls:** Previous and Next, a progress strip with one segment per Rock (colour = status, a dot = dealt with, click to jump; it squeezes to fit so it never scrolls sideways however many Rocks there are), `←` `→` `Home` `End`, `Esc` to leave, and a filter for **All Rocks** or **Needs the room**. The deck is fixed when the view opens, so a Rock does not disappear from under the room when its status changes. Arrow keys are ignored while someone is typing, and a screen reader is told "Rock 3 of 9: title".
- **Each slide is built around what the Rock contains:** title, owner, due date and status; one question for the facilitator suited to the status (for example for off track: "What is the cause? Do not solve it here. If it needs the room, raise it for IDS"); the reasons it needs the room, in words (off track, blocked, a Rock below it is blocked, milestones blocked, overdue, nobody owns it); the latest status change ("moved from on track to off track on 21 Oct"); the Rock's blocker if it has one; its milestones, most urgent first, with milestone blockers; its Individual Rocks with milestone mapping and unmapped work (the same section as on the card); any carryover; and a link to the full Rock.
- **Status decision:** pressing the status a Rock already has *confirms* it; pressing another changes it. **It is blocked…** opens the blocker dialog (a reason is required); a blocked Rock shows its blocker and **Resolve blocker…**, and resolving never marks it complete. Complete is not offered here.
- **Raise it for IDS:** drafts an issue from the Rock (title says what and why, the description carries status, owner, due date, milestones, flags, blocked milestones and the blocker with its next action), editable, with an optional "what does the room need to decide?". It writes the same columns the IDS dialog writes (`eos_issues`, `item_type` risk, `linked_rock_id`, `meeting_id`, the segment, `source` by meeting type) so it lands in the IDS queue, and other attendees' queues refresh through the meeting's existing `issue_change` broadcast. A Rock that already has an open issue shows it first and asks for a deliberate second one. A stuck or late Rock gets the panel open and highlighted; a clean one stays quiet.
- **Notes:** a Notes panel in the same rail (under the status panel) keeps dated, append-only notes per Rock, with a Dictate button that keeps listening as the room moves between Rocks and a Rock's details panel. See [rock-notes.md](rock-notes.md).
- **Wrap-up (last slide):** what was confirmed, changed and raised, what was not reached, and a warning listing stuck or late Rocks that nobody raised an issue for and that have no open issue, each with "Go back to it".

## Where the code is

`src/utils/rockDiscussion.ts` (deck order, reasons, cue, issue suggestion and draft, wrap-up; all pure and tested), `src/hooks/useRockDiscussion.ts` (linked issues, raise issue, set status, milestones), `src/components/eos/meeting/discuss/` (`RockDiscussDialog` shell, `RockDiscussSlide`, `RockStatusDecision`, `RaiseIssuePanel`, `DiscussWrapUp`), wired in `MeetingRocksReview.tsx` and `LiveMeetingView.tsx` (which passes the meeting, segment and type). The view mounts only while open, so nothing runs or fetches when it is closed.

## Built to fit one screen

A presenter should not be scrolling. The slide is laid out so a whole Rock fits without vertical scrolling at common screen sizes: one slim top bar (title, position, progress strip, filter); a compact title line; the facilitator's question and the flags on one panel; the status and raise-an-issue rail beside the title (it scrolls inside itself if it is ever taller than the screen); milestones and Individual Rocks side by side on a wide screen, or milestones in two columns when there is nothing to put beside them. A milestone's owner is shown only when it differs from the Rock's owner. On a short screen (under about 820 px tall) fewer milestone rows show before "Show all". The list of which Company milestone each Individual milestone supports is left out of the slide (the rows and summary still flag unmapped work; the full Rock has the list). Measured in a browser with a realistic set of Rocks: 1440×900 and 1920×1080 fit with no scrolling at all, 1366×768 fits except the heaviest case (a blocked Rock with a full blocker panel, 19 px over), nothing ever scrolls sideways, and a 1024-wide window stacks into one column and does scroll a little.

## What it deliberately does not do

- It does **not** sync the presenter's position to other attendees' screens; whoever opens it drives it (the facilitator shares their screen). Raised issues do sync. Syncing the position would need a realtime channel; a possible follow-up.
- No timer per Rock. The intended pace (seconds for an on-track Rock, a minute or two for a stuck one) is a cue, not a control.
- No "reviewed" record is stored: what happened to each Rock in the view lives for that opening, apart from the issues it raised and the status or blocker changes it made, which are saved as normal.
- Raised issues use `item_type` `risk`, the same as the IDS dialog's default.
- Team-level and Individual Rocks appear as slides only when the meeting's `rocks_scope` includes them; otherwise Individual Rocks appear inside their Company Rock's slide.

## Verification

- Pure logic and the whole view are covered by tests (`rock-discussion.test.ts`, `rock-discuss-dialog.test.tsx`): deck order and filters, a Rock not vanishing when its status changes, keyboard handling (including not hijacking typing and Escape), confirm versus change, blocked Rocks, issue drafting and the exact payload (Rock, meeting, segment, source), duplicate protection, the broadcast, failure paths, and the wrap-up.
- Fit measured in a browser with faked data (throwaway harness, deleted): vertical overflow in pixels per Rock at 1366×768, 1440×900, 1920×1080 and 1024×768, with horizontal overflow and rail overflow checked at the same sizes (see "Built to fit one screen").
- Browser walk with faked data (throwaway harness, deleted): 1440px light and dark, 1920px, and 375px; no horizontal overflow and no console warnings after fixes. Keyboard-only walk of the deck, raising an issue, and leaving. The walk found and fixed: first focus landing on a hidden title instead of the Rock, the right-hand rail being unreachable on a tall slide, a success toast taking the first Escape press, and oversized type on a phone.
- **Not verified:** a real meeting with real Rock data, and the time it takes in practice.

Related: [rock-blockers-and-carryover.md](rock-blockers-and-carryover.md) (the blocker dialogs and Individual Rocks section it reuses).
