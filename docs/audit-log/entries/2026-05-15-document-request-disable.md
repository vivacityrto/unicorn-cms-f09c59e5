# Audit: 2026-05-15 — document-request-disable

**Trigger:** ad-hoc — investigation surfaced a half-shipped feature
worth a `git log --grep` anchor for whoever re-enables it.

**Scope:** Investigated the client-portal "Request document" feature
end-to-end (DB → client UI → CSC UI → notifications) in response to
a `tenant_document_requests_category_check` violation on create.
Decided to disable all client-side entry points pending a proper
build-out. Did not investigate or change: `portal_documents`, the
broader notification pipeline, or any other client-portal feature.

## Findings

- **Immediate failure cause.** DB CHECK constraint
  `tenant_document_requests_category_check` allows only
  `('Compliance','Evidence','Admin','Other')`, but the frontend
  `CATEGORIES` array in `DocumentRequestModal.tsx:17` led with
  `"Documents"` and `useClientRequestActions.ts:7` set
  `"Documents"` as the prefill default — guaranteeing rejection for
  every entry point that goes through the prefill.
- **Feature is half-shipped.** No CSC-side UI exists anywhere in
  the codebase: no inbox of assigned requests, no fulfilment flow
  to create `tenant_document_request_attachments`, no status
  transitions (`open → in_progress → completed`). Client can
  create rows; nobody can act on them.
- **Notification delivery is broken.** `emit_notification` for
  `document_request_created` writes to `notification_outbox`, but
  no consumer drains the outbox into `user_notifications` (the
  table `useNotifications` actually reads). Even if the CSC had a
  UI, they would not be alerted.
- **Latent label/wiring mismatch.** `ClientFooter.tsx:58` renders a
  button labelled "Message your CSC" whose `onClick` is
  `openDocumentRequest()` — i.e. it opens the document request
  modal. Either the label is wrong or the wiring is wrong. Parked,
  not fixed in this session.
- **Six entry points to disable, not five.** Initial scope missed
  `ClientDocumentsPage.tsx:247`; Lovable flagged it during plan
  review. Final list: `ClientHomePage` (×2), `ClientFooter`,
  `ClientLayout` (context provider noop'd as defence-in-depth),
  `ClientTgaDetailsPage`, `ClientDocumentsPage`, and the "New
  request" button inside `ClientDocumentRequests`.

## KB changes shipped

- No changes this session.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `d240b112` (HEAD at time of audit;
  local working state was Lovable plan-mode commits).
- Disable PR drafted via Lovable prompt (UI-only, no DB, no hook
  changes). Buttons greyed with shadcn `disabled` + tooltip
  ("Coming soon — your CSC will reach out directly for now");
  `DocumentRequestModal`, `useDocumentRequests`,
  `useClientRequestActions`, and the request list + cancel actions
  left untouched. `ClientRequestContext` value swapped for a no-op
  as defence-in-depth.
- DB / migrations: not changed.

## Decisions

- **Disable, don't delete.** Buttons stay in place greyed/tooltipped
  so the feature can be revived cleanly when the CSC-side workflow
  exists. `// TODO: re-enable when document request workflow is
  complete` markers left at each site.
- **Disable preferred over hide.** Hiding would shift surrounding
  layout; disable preserves it.
- **Latent "Message your CSC" mislabel parked.** Not fixed in this
  PR — needs a product call on intent (relabel vs rewire).

## Open questions parked

- "Message your CSC" label/wiring mismatch — product decision
  pending. Relabel to "Request a document"? Or rewire to actually
  open a CSC chat surface (which doesn't exist yet)?
- Re-enable path. Three layers identified:
  - A: fix category mismatch (UI-only)
  - B: build CSC inbox + status transitions + working notification
    delivery (replace outbox call with direct `user_notifications`
    insert, or build the outbox consumer)
  - C: fulfilment flow (upload → `portal_documents` w/ visibility
    `shared_with_client` → `tenant_document_request_attachments`
    → status `completed` → notify client)
- `notification_outbox` consumer: is the outbox model the intended
  long-term path, or should call sites be writing directly to
  `user_notifications`? Affects more than this feature.

## Tag

audit-2026-05-15-document-request-disable
