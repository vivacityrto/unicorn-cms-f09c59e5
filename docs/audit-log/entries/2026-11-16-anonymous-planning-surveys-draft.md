# Audit: 2026-11-16 — Anonymous planning survey draft

**Trigger:** Angela requested SWOT and Start, Stop, Keep prework inside EOS for
separate Vivacity and ComplyHub 2027 planning. She selected anonymous responses
and accepted the shared-link tradeoff: duplicate submissions cannot be prevented
per person, and reminders/completion reporting cannot identify individual staff.
**Scope:** draft migration, capability-only collection function, standalone survey
entrypoint and tests on the isolated PR branch. **Not applied or deployed.**

## Findings and implementation

Live metadata inspection confirmed `eos_qc_answers` uses `audit_eos_change()`,
which records the whole answer row together with `auth.uid()`. It must not be
reused for anonymous feedback. No existing audit or access controls were changed.

The new draft response table contains random record/receipt IDs, campaign ID,
questionnaire version and answers only. No user/profile FK, IP, name, role or
submission timestamp. Both tables have RLS and no `anon`/`authenticated` grants.
The service-only invoker RPC locks the campaign row before checking receipt and
capacity; identical retries confirm without replacement, including after close;
changed retries fail. New submissions after close fail. Campaigns have no seeded
keys or data and default to draft/unapproved. Do not attach the general EOS audit
trigger to answer storage.

The Edge function accepts a campaign capability, not staff authentication. It
rejects Authorization/Cookie headers, validates body shape/size, never logs input
or exception details and has no response read API. Runtime enablement and each
campaign's approval gate default off. `verify_jwt=false` is a draft per-function
configuration, not a deployed relaxation; the high-entropy campaign capability
is the collection authorisation gate. The protected client app is unchanged.

The dedicated `planning-survey.html` entrypoint imports no auth provider,
Supabase session client, app telemetry or replay. Shared keys are URL fragments,
removed before API calls. Fetch explicitly omits credentials/referrer and rejects
redirects. Answers and retry receipt remain in memory only. Uncertain sends retry
the identical ballot; no edit or second receipt is allowed in that state.

## Verification and limits

Local ephemeral PGlite 0.5.16 ran the actual draft SQL: schema creation, anon and
authenticated denials, service acceptance, identical retry, conflicting retry,
unknown fields, wrong key, response capacity, post-close replay/new-ballot
rejection and absence of identity/timestamp columns passed. This is local SQL
verification, not hosted Supabase policy parity or multi-connection concurrency
stress. The reproducible harness is `scripts/test-anonymous-planning-db.mjs`.

Unit/component tests cover request credential omission, disabled gates,
metadata rejection, bounded body, errors, review/consent, accepted confirmation,
and exact retry after an uncertain result. Repository check results belong in
PR 1516; failed/not-run checks must remain explicit.

## Release hold and remaining work

- No migration applied, function deployed, keys generated, campaigns opened,
  real answers collected, permissions changed or invites sent.
- Verify hosted logging/tracing does not capture keys/answers. Network providers,
  DB operators and transaction history can still correlate metadata: no claim
  of operator-proof unlinkability. Free text can identify authors.
- Inspect final built page for injected analytics/replay and test browser flow.
  Initial HTML requests on a shared origin can still carry existing cookies;
  do not confuse credential-omitting API calls with zero hosting metadata.
- A shared-key holder can flood/forward a link. The count/size caps are not a
  substitute for reviewed privacy-preserving abuse/rate controls before launch.
- Reviewer/results UI is drafted in the fourth slice below but **not** enabled; exports remain absent. The minimum count helper/field
  is not proof of deployed result suppression. Duplicate ballots mean counts
  are responses, not verified unique people. Keep results closed until access,
  suppression and thematic review are implemented and tested.
- Production deployment and explicit activation require their own authorisation
  after QA/privacy review. Never merge this Edge PR as a harmless code-only step:
  the repository deploys affected Edge functions when merged.

## Fourth draft slice: restricted review and abuse budgets

A separate logged-in reviewer route and endpoint are now drafted. UI visibility
uses `usePermissionDetailed`; Edge uses canonical `requireCaller` with existing
`eos.configurations.manage/full`. Neither substitutes for explicit campaign
membership. The service-only RPC rechecks membership, close/raw privileges,
closed state, configured response threshold and privacy-release approval under
the campaign row lock. No members or release approvals are seeded. The only
administrative mutation exposed is closing collection, with explicit UI intent;
there is no open/reopen, assignment, key creation, settings change or publish API.

Results contain independently shuffled answer text per question, not row IDs,
receipt keys, times or cross-question respondent grouping. Text is rendered as
React text, not HTML. No export, AI summarisation, automatic downstream updates
or live results feed. Reviewer actions audit actor/campaign/action only, never
answer contents. Threshold counts submissions, not unique people.

New ballots are bounded by a configurable campaign-wide per-minute database
budget (default zero) under the same lock; exact accepted retries bypass this
budget. The current aggregate minute is retained without participant identifiers.
A coarse per-isolate ingress budget rejects excess requests before DB lookups.
This is NOT distributed gateway protection, and a link holder can still exhaust
capacity. Runtime activation additionally requires an explicit gateway-review
gate. Distributed traffic, provider logs and privacy-preserving upstream abuse
controls remain unverified deployment blockers.

Local SQL tests now exercise missing reviewer, missing approval, insufficient
count, open collection, wrong reviewer, close then review, direct-role denials,
minimal audit payload, rate cap and replay exemption. Unit/component tests add
review intent, wrong-campaign rejection, no mount-time raw fetch, answer clearing,
rate-budget rollover and invalid limits. Final suite results are recorded in PR.

Browser QA: a legitimate escalated local Chromium retry still failed at socket
creation. Cloud-browser fallback could not reach localhost preview (connection
refused), so no visual/runtime browser proof is claimed. No Sage desktop control
was taken. Review route also needs telemetry/replay inspection before raw data is
exposed; importing it inside the authenticated app does not itself prove that.

## Fifth slice: independent review remediation

Independent review of fourth-slice head found no confirmed auth bypass but noted
rare answers were returned once total ballots met the threshold. The RPC now
also suppresses each question below the configured nonempty-ballot threshold.
It does not reveal those sparse counts. This still does not prove distinct
participants and does not eliminate self-identifying free text.

Fixed the stale unmounted label. Reviewer activation additionally requires an
explicit `PLANNING_SURVEY_REVIEW_PRIVACY_VERIFIED` release gate; this is a hold,
not evidence the telemetry/log review has been completed.

Extracted the reviewer HTTP handler for integration testing. Tests execute the
real canonical `requireCaller`, and the production reviewer adapter, using only
synthetic Deno/Supabase transports. Missing, malformed and invalid auth, full
permission scope, verified actor binding, denied/revoked permission, forged
actor payloads, disabled service, oversized input and generic failures are
covered. These tests do not verify hosted JWT signature validation, real account
revocation, deployed gateway behaviour or current role grants. Those remain
release gates, alongside browser QA and distributed abuse protection.

Also hardened grants against broad hosted default privileges: migration now
revokes service-role defaults before granting only required operations, rather
than assuming an additive GRANT removes default DELETE/UPDATE privileges. The
local SQL harness now starts with broad default grants and confirms migration
revocation, including denied service-role response deletion. Hosted parity still
requires verification; this test is deliberately not a claim about live grants.
