# TOM P0.2/P0.3 — synthetic QA fixture seed record (2026-09-13)

> **Status:** synthetic fixture seeded and read-only verified; canonical QA `app_settings` row added; representative query-family expansion added and verified; anonymous plus nine browser-authenticated QA personas characterized, with a separate non-browser service-principal read contract; address route/card follow-up run `34759865158` passed with the populated address query returning HTTP 400 (broader P0.2/P0.3 coverage remains open)
> **Target:** `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`, `https://qfpxvumcrnzrjyvqkicq.supabase.co`); production target: false
> **Run tag:** `tom_qa_20260913_seed_01`
> **Audit entry:** [2026-09-13 TOM representative QA query-family fixture expansion](../../../../audit-log/entries/2026-09-13-tom-representative-qa-fixture-expansion.md)
> **Address audit entry:** [2026-09-13 TOM tenant-address browser characterization](../../../../audit-log/entries/2026-09-13-tom-address-browser-characterization.md)

## Purpose and boundary

This record documents the first hosted QA fixture seed after Carl approved the
TOM P0.2/P0.3 preflight. The seed supplies a small production-shaped data
surface for later read-only characterization of tenant, membership, contact,
package/stage, and conversation relationships.

After the initial waterfall identified the empty global-settings shape, Carl
approved a QA-only follow-up insertion of one default-valued
`public.app_settings` row. It contains no URLs, credentials, customer values,
or copied production settings; it exists to exercise the table's intended
single-row contract while the client-denied negative path remains covered.

“Production-shaped” means that the fixture follows the observed production
cardinality patterns and state categories. It does **not** mean copying
production rows, names, emails, UUIDs, browser storage, or other customer
data. The production comparison was aggregate-only: 55 active tenants, 559
active tenant members, 114 contacts, 45 packages, 1,052 package instances,
104 stages, 278 package-stage mappings, 506 conversations, and 701 messages.

The existing persistent `qa-e2e` tenant and its two approved E2E personas were
not modified by this run. The synthetic profile rows below remain fixture
records. Nine QA auth identities are now available for the TOM persona matrix
through the protected `qa-seed-e2e-personas.yml` workflow; the separate
service-principal identity is exercised only by a non-browser read-contract
check. Password values and browser storage states are not stored in the
repository.

## Seeded fixture

| Domain | Count | Notes |
| --- | ---: | --- |
| Synthetic tenants | 5 | Empty, representative A/B, skewed, and disabled-user strata |
| Synthetic user profiles | 15 | 14 active membership subjects and 1 disabled/inactive subject; no auth credentials created |
| `tenant_members` | 15 | 14 active, 1 inactive |
| `tenant_users` | 15 | Full-scope standard relationship rows |
| `tenant_contacts` | 10 | 8 active, 2 archived |
| Packages | 3 | 2 active, 1 inactive |
| Stages | 6 | Shared synthetic catalogue rows |
| Package-stage mappings | 18 | Six mappings per synthetic package |
| Package instances | 9 | Active, complete, cancelled, and paused states |
| Conversations | 9 | Open and closed synthetic threads across representative/skewed/disabled strata |
| Messages | 18 | Client/staff pairs; all carry the run tag in `meta` |
| `app_settings` | 1 | Canonical identity row; integration URLs null, email/generation side-effect flags explicitly disabled |

The empty stratum has zero members, contacts, and package instances. The
representative strata have two and three members respectively. The skewed
stratum has nine members, five contacts, and four package instances. The
disabled stratum has one disabled profile with an inactive membership and one
archived contact. These values preserve the production observation that most
active tenants have one to three members and one package instance, while still
providing a high-cardinality negative/edge case.

The seven `dd_membership_state` reference rows were also present in the seed
transaction because the empty QA schema had the foreign key but no lookup
rows. They contain only the non-sensitive state labels used by the application
(`active`, `at_risk`, `warning`, `paused`, `exiting`, `complete`, and
`cancelled`) and were not copied from any production row.

The credential provisioning run also added the missing QA-only
`Client Parent` value to `dd_user_type`, because the existing role trigger
derives that value for an Admin profile. This was an idempotent reference-data
repair in `unicorn-qa`; it did not alter production schema or reference data.

## Representative query-family expansion

After the initial seed, the approved contract was executed against the same
allowlisted QA project. The expansion added 3 `tenant_addresses`, 1
`tenant_relationships`, 2 `tenant_csc_assignments`, 2 `connected_tenants`, 3
`conversation_participants`, 1 `ask_viv_conversations`, and 2
`ask_viv_turns` rows. The rows are synthetic and captured by deterministic
run-scoped identifiers or the `TOM_P0_20260913_QUERY_FIXTURE` marker; no
production data or identity was copied.

## Provisioned QA personas

The four additional identities are intentionally run-scoped labels rather than
real client identities:

| Persona | Role/profile | Tenant context | Verification |
| --- | --- | --- | --- |
| Client Admin A | `Admin` / `Client Parent` | Representative Tenant A (fixture tenant 2) | Auth row, active `tenant_members`, and full-scope `tenant_users` link present |
| Client User A | `User` / `Client Child` | Representative Tenant A (fixture tenant 2) | Auth row, active `tenant_members`, and full-scope `tenant_users` link present |
| Client Admin B | `Admin` / `Client Parent` | Representative Tenant B (fixture tenant 3) | Auth row, active `tenant_members`, and full-scope `tenant_users` link present |
| CSC | `Team Member` / `Vivacity Team` | Internal staff context; no tenant assignment | Auth row and profile present; no tenant portal link intentionally created |
| Integrator | `Integrator` / `Vivacity Team` | Internal staff context; no tenant assignment | Auth row/profile present; protected browser characterization reached `/manage-tenants` |
| Team Leader | `Team Leader` / `Vivacity Team` | Internal staff context; no tenant assignment | Auth row/profile present; protected browser characterization reached `/manage-tenants` |
| Disabled staff | `Team Member` / `Vivacity Team`, `disabled=true` | Internal staff context; no tenant assignment | Protected browser characterization reached the expected `Account Disabled` state |
| Service principal | `Integrator` / `Vivacity Team`, `is_system_account=true` | Non-browser QA identity; no tenant assignment | Protected non-browser sign-in and one approved `tenants` read passed; no browser storage state |

The pre-existing QA Super Admin and basic client identities remain available
through their protected environment secrets. The service principal is not a
browser persona and is not included in Playwright storage-state generation; its
password exists only in the protected QA environment for the narrow read
contract.

## Safety and rollback

- The write targeted only the allowlisted QA project and used a transaction.
- Every synthetic tenant, profile, contact, package, stage, instance,
  conversation, and message is identifiable by the run tag or a deterministic
  run-scoped UUID derived from it.
- No production URL, production UUID, production row, production browser state,
  service key, or password was written to the repository or fixture. Passwords
  exist only in the protected `unicorn-qa` GitHub environment.
- No migration, schema, RLS, grant, Realtime, cron, Edge deployment, outbound
  email, or production operation was performed.
- The additional `app_settings` insertion was limited to `unicorn-qa`, started
  from the table's defaults, then explicitly disabled email and generation
  side effects; it was not copied to production.
- The representative expansion used one QA-only transaction. The two Ask Viv
  turns were corrected from `compliance` to the current history hook's
  `assistant` mode after the first read-only run exposed the fixture mismatch.
- Exact expansion cleanup, if later approved, must use captured keys in
  dependency order and must not remove persistent QA personas or shared lookup
  rows. Cleanup was not run here.
- Cleanup has **not** been run. If the fixture is retired, use a separately
  reviewed run-scoped cleanup in dependency order: messages, conversations,
  package instances, package-stage mappings, stages, packages, contacts,
  tenant-user links, memberships, synthetic profiles, then synthetic tenants.
  The persistent `qa-e2e` tenant/personas and the seven shared lookup rows must
  not be included in that cleanup.

## Read-only verification

The post-seed QA query returned:

- 5 tagged tenants, 15 tagged profiles, 15 memberships, and 15 tenant-user
  links;
- 8 active and 2 archived contacts;
- 3 packages, 6 stages, 18 mappings, and 9 package instances;
- 9 conversations and 18 tagged messages;
- zero orphan messages; and
- zero tagged profiles outside the synthetic `@example.qa` domain.

The per-tenant distribution was `0/0/0`, `2/2/2`, `3/2/2`, `9/5/4`, and
`1/1/1` for members/contacts/package-instances. The initial bounded browser
run [`34741345064`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34741345064)
passed 7 checks and intentionally skipped 1 CSC-inapplicable client check.
The expanded read-only run
[`34742103123`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34742103123)
passed 48 checks and intentionally skipped 4 CSC-inapplicable client checks
across one warm-up plus three measured repetitions. It covered the persistent
Super Admin and client personas as well as the three TOM client personas and
CSC. No application writes were performed; browser storage states were
ephemeral and only the redacted runner log was retained for 30 days in the
private GitHub Actions artifact.

After the canonical `app_settings` row was added and its email/generation
side-effect flags were explicitly disabled, the final post-seed run
[`34751973789`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34751973789)
again passed 48 checks with 4 intentional skips. Its redacted waterfall
recorded 1,701 requests: 1,673 status-200 responses, no 401 responses, four
expected 406 responses on the client persona's denied `/admin/user-audit`
navigation, 24 bounded in-flight records, and zero request failures.

The missing-persona provisioning run
[`34753300796`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34753300796)
re-seeded the deterministic QA identities and passed the separate
non-browser service-principal read contract. The follow-up protected browser
characterization
[`34753357650`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34753357650)
covered the anonymous, persistent, and nine browser-authenticated persona
projects with `60 passed, 16 skipped` and no flaky or failed tests. Integrator
and Team Leader reached `/manage-tenants`; disabled staff reached the expected
`Account Disabled` state. The service principal was intentionally excluded from
browser storage and was verified only by its explicit read contract.

The corrected expanded staff read-surface run
[`34755463485`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34755463485)
ran the tenant-detail, integrations, and Ask Viv navigation checks four times
for the staff personas and completed with `84 passed, 16 skipped`, with no
failures or flakes. It confirms the first tenant detail read model and
integrations page are reachable to the staff fixture. Ask Viv is route-
reachable, but these personas currently receive its rollout-unavailable card;
the check accepts that current state or an enabled composer and performs no
assistant generation or write.

The representative query-family run
[`34757778368`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34757778368)
completed with `84 passed, 48 skipped` and no failures. Its successful
waterfalls observed `tenant_relationships`, `tenant_csc_assignments`,
`connected_tenants`, `conversation_participants`, and `ask_viv_turns` reads.
The current browser spec did not reach `tenant_addresses`, and did not produce
a separate `ask_viv_conversations` request; these remain explicitly
unexercised rather than being treated as empty or unavailable. Production
aggregate counts for all seven expanded families were unchanged after the
QA-only operation.

The separately scoped address follow-up
[`34759865158`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34759865158)
completed with `88 passed, 48 skipped` and no failures. The protected
SuperAdmin route rendered the `Addresses` heading without page errors, but the
underlying `tenant_addresses` request returned HTTP `400`, so the seeded
address row is not claimed as browser-rendered. The test records this as a
current QA query/read-shape gap; it did not change the empty QA
`dd_address_type` lookup or any schema, RLS, grant, or production behavior.

## Remaining P0.2/P0.3 gates

The fixture and nine browser-capable QA identities now exist, and the expanded
bounded browser run is recorded above. Before calling the broader P0.2/P0.3
packet complete, it still needs:

1. address query/lookup-contract review and Ask Viv conversation-history browser coverage, plus
   representative full-cardinality and unexercised detail/export/Realtime/
   RPC/Edge/Ask Viv query-family coverage; and
2. RBAC, Client Health, and TOM owner review of authorization, provenance,
   freshness, and fixture representativeness.

The read-only [cardinality/query-family follow-up](p0-2-p0-3-cardinality-query-family-follow-up-2026-09-13.md)
now records the production comparison and confirms exactly which current QA
relations were empty before this expansion. The [representative fixture
contract](p0-2-p0-3-representative-query-fixture-contract-2026-09-13.md) and
linked audit record now document the approved expansion and run; the remaining
browser coverage and cross-initiative owner review gates are still separate.

The first run should stay narrow: representative and cross-tenant package /
client-stage reads plus disabled/inactive negative cases. No v6 capability,
grant, route, RLS/RPC, Realtime, ghost-contact promotion, forecast, or
production change is implied by this seed.
