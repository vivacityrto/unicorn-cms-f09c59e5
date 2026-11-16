# Anonymous strategic planning surveys

Status: draft implementation slice, 16 November 2026. Not deployed, routed or
accepting responses. This is not an existing operational capability.

## Product decision and scope

Angela requested team SWOT and Start, Stop, Keep prework inside Unicorn EOS,
with separate Vivacity and ComplyHub planning days for 2027. She selected
**anonymous** responses. Mission Control and four quarterly Flight Plans per
business are the planning outputs. No automatic Issues, Rocks or tasks arise
from a response. NPS is not included in this slice.

The current EOS area is internal-only. A ComplyHub business label is a planning
partition, not a permission to reopen client-tenant EOS access or expose one
company's records to another audience. See the [client-access retirement
record](../audit-log/entries/2026-09-15-retire-client-eos-access.md).

## Implemented in this draft

- Versioned, client-outcome-focused questionnaire with eight optional prompts.
- Separate business/year context, clearing sample memory when context changes.
- Review/back/clear interactions and input length limits.
- Explicit preview-only warning and permanently disabled submission.
- An allowlisted answer parser that excludes unknown identity/metadata fields.
  This is an input boundary, **not proof of anonymity**.
- No route, production navigation, auth dependency, network call, analytics,
  browser storage, server draft, submission handler, migration or permission
  change. The preview is unmounted and must not be used to gather real feedback.

## Privacy decision still requiring technical resolution

Angela chose anonymous, not merely hidden names. Do not silently downgrade that
choice to confidential named answers. Before enabling collection, explain and
verify the precise protection: anonymity from ordinary planning reviewers does
not by itself establish unlinkability from infrastructure operators.

An authenticated insert without a user_id column can still be linked using JWT,
IP, exact submission time, request traces, audit actors, transaction history or
completion records. Hashing a user ID or sharing a token between eligibility and
answer tables is pseudonymisation, not unlinkability. Free text can identify its
author despite technical protections. Thresholds reduce, not eliminate, that risk.

### Required design properties

1. Separate eligibility issuance from answer collection. No retained identity to
   ballot mapping, stable cross-campaign pseudonym, user/profile FK, email,
   invitation ID or identity-bearing token in answers or exports. If one-person
   one-response is required, use a reviewed anonymous-credential design rather
   than inventing cryptography or promising unlinkability for mapped tokens.
2. No account-linked saved drafts or individual completion/reminder roster.
   Start with memory-only drafts and general reminders; disclose loss on exit.
   Any later resume/recovery mechanism needs its own privacy review.
3. No submission payload/token/IP capture by analytics, replay, error tracking,
   gateway, Edge, database audit or hosting logs. Verify configuration and
   failure paths, not just application source. Minimal separate security audit
   should record campaign/reviewer administration without linking identities
   to answer text or submission identifiers.
4. No live individual response stream or exact submission-time display. Results
   remain unavailable until close and an agreed minimum response count. Five is
   a proposed review threshold, not an approved policy or anonymity guarantee.
   Suppress narrow role/team filters, overlapping slices and differencing paths.
5. Limit raw-answer access. Prefer reviewed thematic summaries for the team;
   free-text quotations, exports and AI processing need the same privacy gates.
6. Bind business, year and question-version server-side; separate campaigns must
   not share respondent IDs. Do not reuse employee Quarterly Conversation rows.
7. State clearly that distinctive examples/writing can reveal identity. Ask
   respondents not to name colleagues, clients or themselves. Do not promise
   that technical operators cannot identify people unless that is demonstrated.

## Remaining implementation packets

- Review current backend tables, grants, RLS, audit triggers, telemetry and
  ownership. Freeze threat model and participant/reviewer scope.
- Design and independently review anonymous collection, replay handling and
  campaign close/release rules. No default permission expansion.
- Implement new scoped campaign/response storage and minimal service boundary
  with a migration/audit PR, **without applying it to production**.
- Connect the questionnaire only after privacy/access tests pass. Finalise
  copy explaining actual protections before any real participant enters data.
- Build closed-campaign thematic review and deliberate links to Mission Control,
  four quarterly Flight Plans, Issues and Rocks. Keep original responses intact.

## Verification gates

Synthetic QA only. Inspect full request, gateway/log, database/audit and export
paths for seeded identity canaries. Test correlation with real reviewer/operator
privilege boundaries; other respondents, clients and unauthorised staff must be
denied. Verify cross-business denial, concurrent replay, retries after uncertain
success, closed/expired campaigns, logging on errors, question-version snapshots,
minimum-group suppression and no early-results/differencing bypass. Route guards
alone do not satisfy RLS tests. Verify no account-linked draft or completion join.

The current tests prove only the unmounted preview's interactions, memory reset,
no fetch/browser-storage writes in those interactions, and parser behaviour.
They do not establish backend anonymity. Required repository automated checks
and browser QA are recorded in the draft PR/handoff with explicit passed,
failed and not-run distinctions. Code merge, migration, release and user-journey
verification are separate milestones. No production action is authorised by
this document.

## Second draft slice: collection contract, not a deployed collector

The pure `_shared/anonymous-planning-survey.ts` module now validates a strictly
allowlisted answer envelope against server-resolved campaign/year/business and
questionnaire context. Unknown metadata is rejected, invalid/closed windows
fail closed, responses are bounded, and error text never echoes input. Retry
classification distinguishes identical replay from changed-payload conflict;
production must enforce this atomically in its database adapter. It is not
one-person-one-response enforcement. Random retry IDs must never be derived
from accounts or reused across campaigns.

Theme-release gating requires closed collection, a deliberately supplied
minimum count and completed privacy review. This helper is not authorisation
or a substitute for server-enforced access. Tests cover each rule with synthetic
inputs. There is still no handler, adapter, database table or route collecting
responses, and no claim of end-to-end unlinkability.

### Pending product tradeoff

A shared, untracked campaign link can avoid sending a staff login with answers,
using aggregate participation and general reminders only. It cannot guarantee
one-response-per-person, and anyone given the link can submit. An individually
tracked link or authenticated answer submission would instead require a reviewed
anonymous credential mechanism to preserve unlinkability. Angela is being asked
about the shared-link/duplicate/reminder tradeoff; neither choice is assumed.
Hosting/network metadata and identifying free text remain part of the disclosure
and release review even with an untracked link. Supabase's current
[correlated-log changelog](https://supabase.com/changelog/53230-correlated-logs)
reinforces the need to verify infrastructure logs, not just omit a user column.
