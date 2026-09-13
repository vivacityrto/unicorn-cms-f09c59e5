# 2026-09-13 — TOM tenant-address browser characterization

> **Tag:** `audit-2026-09-13-tom-address-browser-characterization`
> **Owner:** Codex
> **Target:** `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`)
> **Boundary:** read-only protected browser characterization; no live repair

## Trigger and authorization

This entry records the separately scoped, read-only follow-up for the
`tenant_addresses` query family in the approved TOM P0.2/P0.3 QA fixture. The
test used the existing SuperAdmin storage state and visited only
`/tenant/54?tab=overview`; it did not open an address form or invoke a writer.

No production, schema, RLS, grant, Realtime publication, Edge Function, cron,
export, outbound integration, or credential change was made.

## Verification

- Local verification passed after the focused test was narrowed to the stable
  route/card contract: `lint:ratchet`, `typecheck`, `test:frontend` (579
  passed, 43 skipped), and `test:edge` (290 passed).
- Protected workflow run
  [`34759865158`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34759865158)
  completed successfully with `88 passed, 48 skipped` and no failures or
  flakes across the four-repeat matrix.
- The SuperAdmin tenant-detail route rendered the `Addresses` heading with no
  page errors. The redacted waterfall captured
  `GET /rest/v1/tenant_addresses` with HTTP `400`; the seeded address label
  was not rendered. This is an observed query/read-shape failure, not evidence
  that the QA table is empty or that production addresses are unavailable.
- The QA fixture's `dd_address_type` lookup remains empty and
  `tenant_addresses` has no declared foreign-key relation to it in the
  inspected QA schema. Those facts are plausible context for the 400, but no
  schema or lookup repair was attempted.

## Disposition and remaining gate

The address route/card is reachable for the protected SuperAdmin persona, but
the populated address query is **not characterized as a successful read**.
The test intentionally does not assert a synthetic row until the current
query/lookup contract is separately reviewed. Any repair to schema, reference
data, query shape, RLS, or production behavior requires its own authorization
and audit record.

The separate Ask Viv conversation-history browser path remains unexercised;
its current owner-scoped RLS contract was not changed by this run.
