# TOM P0.2/P0.3 — synthetic QA fixture seed record (2026-09-13)

> **Status:** synthetic fixture seeded and read-only verified; four TOM auth personas provisioned and verified; initial bounded browser characterization passed 2026-09-13 (broader P0.2/P0.3 coverage remains open)
> **Target:** `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`, `https://qfpxvumcrnzrjyvqkicq.supabase.co`); production target: false
> **Run tag:** `tom_qa_20260913_seed_01`
> **Audit entry:** none needed — this was synthetic non-production fixture/persona provisioning; no production, schema, RLS, grant, cron, deployment, or production credential state changed

## Purpose and boundary

This record documents the first hosted QA fixture seed after Carl approved the
TOM P0.2/P0.3 preflight. The seed supplies a small production-shaped data
surface for later read-only characterization of tenant, membership, contact,
package/stage, and conversation relationships.

“Production-shaped” means that the fixture follows the observed production
cardinality patterns and state categories. It does **not** mean copying
production rows, names, emails, UUIDs, browser storage, or other customer
data. The production comparison was aggregate-only: 55 active tenants, 559
active tenant members, 114 contacts, 45 packages, 1,052 package instances,
104 stages, 278 package-stage mappings, 506 conversations, and 701 messages.

The existing persistent `qa-e2e` tenant and its two approved E2E personas were
not modified by this run. The synthetic profile rows below remain fixture
records, not sign-in identities. Four separate QA auth identities were later
provisioned for the TOM persona matrix by the protected
`qa-seed-e2e-personas.yml` workflow (run `34739310678`), using four new
environment-scoped password secrets. Password values and browser storage
states are not stored in the repository.

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

## Provisioned QA personas

The four additional identities are intentionally run-scoped labels rather than
real client identities:

| Persona | Role/profile | Tenant context | Verification |
| --- | --- | --- | --- |
| Client Admin A | `Admin` / `Client Parent` | Representative Tenant A (fixture tenant 2) | Auth row, active `tenant_members`, and full-scope `tenant_users` link present |
| Client User A | `User` / `Client Child` | Representative Tenant A (fixture tenant 2) | Auth row, active `tenant_members`, and full-scope `tenant_users` link present |
| Client Admin B | `Admin` / `Client Parent` | Representative Tenant B (fixture tenant 3) | Auth row, active `tenant_members`, and full-scope `tenant_users` link present |
| CSC | `Team Member` / `Vivacity Team` | Internal staff context; no tenant assignment | Auth row and profile present; no tenant portal link intentionally created |

The pre-existing QA Super Admin and basic client identities remain available
through their protected environment secrets. The service-principal row in the
offline manifest is non-browser and has not been provisioned as a password
identity; it remains an explicit separate gate rather than reusing a service
role key as a browser credential.

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
`1/1/1` for members/contacts/package-instances. The separate bounded browser
run [`34741345064`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34741345064)
passed 7 checks and intentionally skipped 1 CSC-inapplicable client check.
It confirmed client home/package reads for the three client personas, the
relationship-role user-management redirect, and CSC's staff directory
read/search path. No application writes were performed; browser storage
states were ephemeral and only the redacted runner log was retained for 30
days in the private GitHub Actions artifact.

## Remaining P0.2/P0.3 gates

The fixture and the four browser-capable TOM identities now exist, and the
initial bounded browser run is recorded above. Before calling the broader
P0.2/P0.3 packet complete, it still needs:

1. browser storage states generated from the protected QA credentials, plus an
   explicit `Inconclusive` disposition for any persona not exercised;
2. a named operator and observation window; and
3. a private artifact location, retention period, artifact owner, and reviewer
   access.

The first run should stay narrow: representative and cross-tenant package /
client-stage reads plus disabled/inactive negative cases. No v6 capability,
grant, route, RLS/RPC, Realtime, ghost-contact promotion, forecast, or
production change is implied by this seed.
