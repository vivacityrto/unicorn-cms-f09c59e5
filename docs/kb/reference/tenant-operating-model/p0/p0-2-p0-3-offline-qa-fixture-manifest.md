# TOM P0.2/P0.3 — offline QA fixture manifest and preparation record

> **Parent packet:** [P0.2/P0.3 disposable baseline characterization](p0-2-p0-3-disposable-baseline-characterization.md)
> **Manifest:** [machine-readable fixture manifest](data/p0-2-p0-3-qa-fixture-manifest.json)
> **Representative query contract:** [synthetic query-family fixture contract](p0-2-p0-3-representative-query-fixture-contract-2026-09-13.md)
> **Negative cases and cleanup:** [QA negative cases and cleanup/runbook contract](p0-4-qa-negative-cases-and-cleanup-runbook.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** preparation-only; no hosted characterization run executed (see separate seed record)
> **Source:** `origin/main@49fa5e71c401e046c82071a7ba3b05e6d78c373f`
> **Audit entry:** none needed — this remains the planning/manifest record; the separate [QA seed record](p0-2-qa-fixture-seed-record-2026-09-13.md) documents the later synthetic non-production fixture write

## Purpose and boundary

This packet freezes the deterministic fixture, persona, observation, and
safety contract for the approved TOM P0.2/P0.3 plan. It is an offline
preparation artifact, not a live run manifest. The manifest contains no
production identifiers, user names, emails, browser storage state, or secrets.

The target is the existing allowlisted `unicorn-qa` project. This record did
not seed or reset data, perform migration sync, or log into a browser. A
separate, run-scoped synthetic fixture was seeded there on 2026-09-13;
hosted characterization remains blocked on the credential/storage-state,
operator/window, and private artifact-owner gates in the parent packet.

## Fixture contract

The machine-readable manifest defines five tenant strata:

1. small/empty;
2. representative;
3. skewed/high-cardinality;
4. disabled; and
5. a cross-tenant A/B pair with same-named synthetic resources.

Each run must use a generated run ID and fixture tag. The fixture domains are
limited to the tenant, identity, membership/contact, package/stage, audit,
conversation, and message relations needed by the read-only checks. No
production rows or UUIDs may be copied. The persistent QA project may be
reused; “disposable” applies to the fixture data and artifacts, not to
recreating the project.

## Persona matrix

The proposed personas are Client Admin A, Client User A, Client Admin B, CSC,
Super Admin, and a non-browser service principal. Each persona has an explicit
tenant context and read-only coverage. A missing storage state or missing
persona credential is `Inconclusive`, never a pass and never a reason to
substitute a broader identity.

The CSC and Super Admin rows preserve ADR-030's broad internal-read baseline
without inferring broad write, export, destructive, or cross-scope authority.
Client User A must exercise denied admin actions as well as allowed same-tenant
reads. The A/B pair must prove that same-named resources do not cross the
tenant boundary in list, search, detail, export, Realtime, or Ask Viv reads.

## Local-only validation completed

The manifest was checked offline for:

- schema version and required top-level sections;
- unique stratum, persona, query-family, and safety-invariant keys;
- a non-production target reference and explicit `productionTarget: false`;
- absence of service-key, browser-storage, production-UUID, and production-row
  values; and
- the mandatory zero-write ghost-classifier assertions.

This validation proves only that the preparation artifact is internally
complete and safe to carry into a separately authorized QA run. It does not
prove schema parity, RLS behavior, query performance, or persona outcomes.

## Run and artifact contract

After the preflight gates are satisfied, the parent packet's run should use one
warm-up and three measured repetitions per persona/stratum. Capture page
errors, loading/settled timings, redacted request metadata, request waterfalls,
query plans, metadata fingerprints, and visible empty/error/denied states.
Raw traces remain private. The published result contains only the manifest
hash, redacted persona labels, aggregate timings, plan summaries, and links to
the retained private bundle.

The local ghost classifier remains the first oracle and must assert
`writes_performed: 0` and `write_operations: []` for membershipless,
multi-tenant, malformed-email, existing-contact, pending-invite, and collision
cases. A hosted ghost read, if later approved, is a separate operation under
the existing P1.2 allowlist and is not implied by this packet.

## Explicitly blocked items

| Item | Owner | Unblock condition |
| --- | --- | --- |
| QA target and short-lived read identity | Carl / security | Target and credential are confirmed as QA-only |
| Persona storage states | Carl / TOM | Synthetic fixture and storage-state manifest approved |
| Operator and observation window | Carl | Named operator and time window |
| Private artifact location and retention | Operations | Owner and retention period recorded |
| Directory contract and numeric budgets | TOM/product | Baseline reviewed across representative strata |
| Any write, schema, RLS, grant, cron, Edge, or production change | Named implementation owner | Separate authorization, verification, and audit record |

No hosted characterization execution is claimed by this preparation record;
see the separate seed record for the limited QA data-provisioning result.
