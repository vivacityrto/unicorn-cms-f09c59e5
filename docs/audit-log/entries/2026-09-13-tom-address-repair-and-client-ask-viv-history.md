# 2026-09-13 — TOM QA address contract repair and client Ask Viv history characterization

> **Owner:** Codex
> **Target:** `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`); production read-only comparison only
> **Boundary:** QA-only fixture repair plus protected read characterization; no production or policy change

## Trigger and authorization

This entry closes two explicitly authorized follow-ups from the TOM P0.2/P0.3
evidence packet: repair the QA fixture so the existing tenant-address query is
production-shaped, and exercise the client persona's owner-scoped Ask Viv
history read. The work did not alter application authorization, production
data, schema, RLS, grants, Realtime publication, Edge Functions, cron, export,
credentials, or external integrations.

## Independent production/QA comparison

Read-only metadata and aggregate SQL compared `public.tenant_addresses` and
`public.dd_address_type` in QA and production. The columns matched, but QA had
zero `dd_address_type` rows, three synthetic address rows using legacy values
(`head_office`/`mailing`), and no foreign key. Production had four lookup rows
(`HO`, `PO`, `OT`, `DS`) and the foreign key
`tenant_addresses_address_type_fkey` from `tenant_addresses.address_type` to
`dd_address_type.code`; production aggregate counts were 722 addresses and
four lookup rows.

## QA-only repair

In the allowlisted QA project only, one bounded transaction:

1. inserted the four production-shaped lookup codes and descriptions;
2. mapped only rows carrying the run marker
   `TOM_P0_20260913_QUERY_FIXTURE` from `head_office` to `HO` and `mailing` to
   `PO`; and
3. added the production-equivalent `tenant_addresses_address_type_fkey`.

Separate read-only verification confirmed four lookup rows, three tagged
address rows, a successful tenant-54 address-to-lookup join (`HO`, sequence
1), and the expected foreign-key definition. No production write or migration
was run.

## Client Ask Viv history characterization

The client surface is `ClientAskVivPanel`, which reads
`ask_viv_client_conversations` and `ask_viv_client_turns`; it is distinct from
the staff `ask_viv_conversations`/`ask_viv_turns` tables. A deterministic QA
fixture was inserted for Client User A (tenant 54): one conversation with one
synthetic user turn and one synthetic assistant turn. The content is explicitly
non-operational and no generation or writer was invoked by the browser test.

The protected workflow
[`34761219013`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34761219013)
completed successfully with `92 passed, 72 skipped` and no failures. The
dedicated `qa-tom-client-user-a` check passed on all four matrix repeats,
rendered both synthetic turns after opening Ask Viv, produced no page errors,
and its redacted waterfall recorded:

- `GET /rest/v1/ask_viv_client_conversations` → `200`;
- `GET /rest/v1/ask_viv_client_turns` → `200`; and
- no Ask Viv generation/write request.

This is a positive owner-scoped client-history read characterization only. It
does not prove staff history, enabled-rollout behavior, generation, source
freshness, or cross-tenant denial beyond the existing RLS policy inspection.

## Disposition

The QA address query/read-shape gap is repaired and verified in QA, and the
client persona history read is characterized. The following remain separate
gates: production Realtime publication mismatch, representative
full-cardinality/performance evidence, export/download and RPC/Edge coverage,
staff or enabled-rollout Ask Viv history, consultant-data provenance and
freshness, and cross-initiative owner review. Any production schema/RLS/grant,
publication, cron, Edge, credential, or data action requires its own explicit
authorization.
