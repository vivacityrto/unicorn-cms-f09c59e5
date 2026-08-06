# Audit: 2026-05-14 — Client portal CTA routing and inbox deep-link compatibility

**Trigger:** Client portal QA found that multiple visible CTAs labelled as CSC messaging or document requests routed to the wrong surface, and a follow-up search found legacy message notification links using `conversation=` while the current inbox expects `thread=`.
**Author:** Khian (Brian)
**Scope:** `unicorn-cms-f09c59e5` frontend only. Lovable-applied code changes. No database changes. No migrations. No Supabase production touches.

---

## Findings

- **Sidebar and footer CSC messaging CTAs were wired to document requests.** The bottom-left sidebar `Message CSC` button and footer `Message your CSC` button opened the document request modal, while the home-page `Message CSC` card opened the Help Center CSC tab.
- **Documents page request CTA was wired to CSC messaging.** The `Request a document` button on the Documents page opened the CSC Help Center tab instead of the document request modal.
- **Package dashboard `Message CSC` used a different messaging surface.** The package action row linked to `/client/inbox?tab=messages` while the primary client portal CSC actions open the Help Center CSC side panel.
- **Notification links still used a stale redirect route.** Footer `Notifications` and the unread-notification attention item pointed to `/client/notifications`, which only redirects to `/client/inbox?tab=notifications`.
- **Legacy message notification deep links remained partially incompatible.** Older generated notification links used `/client/inbox?tab=messages&conversation=<id>`. The current inbox selection logic only read `thread=<id>`, so old links could land on Messages without opening the target conversation. The full Inbox notification list already had a conversion helper, but the safer fix was to make the Inbox page accept both URL parameters.

---

## Codebase changes shipped

Lovable shipped the fixes in `unicorn-cms-f09c59e5`:

- `c8d7767c` — CTA routing fixes:
  - `ClientSidebar.tsx`: removed `onOpenDocumentRequest` prop and changed bottom `Message CSC` to `openHelpCenter("csc")`.
  - `ClientLayout.tsx`: stopped passing the now-unused sidebar document request prop.
  - `ClientFooter.tsx`: changed `Message your CSC` to `openHelpCenter("csc")`; changed footer `Notifications` to `/client/inbox?tab=notifications`.
  - `ClientDocumentsPage.tsx`: changed `Request a document` to `openDocumentRequest()`.
  - `PackageActionRow.tsx`: changed package `Message CSC` from Inbox link to Help Center CSC side panel.
  - `AttentionPanel.tsx`: changed unread notifications link to `/client/inbox?tab=notifications`.
- `17d9e804` — Inbox legacy deep-link compatibility:
  - `ClientInboxPage.tsx`: changed message thread selection to prefer `thread` and fall back to legacy `conversation`.

Effective inbox behavior after `17d9e804`:

```ts
const threadParam = searchParams.get("thread") ?? searchParams.get("conversation");
```

---

## Verification

Read-only verification after pulling Lovable changes confirmed:

- Sidebar `Message CSC` calls `openHelpCenter("csc")`.
- Footer `Message your CSC` calls `openHelpCenter("csc")`.
- Documents page `Request a document` calls `openDocumentRequest()`.
- Package dashboard `Message CSC` calls `openHelpCenter("csc")`.
- Footer `Notifications` links directly to `/client/inbox?tab=notifications`.
- Attention panel unread notification item links directly to `/client/inbox?tab=notifications`.
- Client Inbox accepts both current `thread=<id>` and legacy `conversation=<id>` deep-link parameters, with `thread` winning when both are present.
- `unicorn-cms-f09c59e5` working tree was clean after each pull.

Local build verification could not run in this checkout because dependencies are not installed:

```text
npm run build
sh: vite: command not found
```

This is an environment/dependency limitation, not a code verification pass.

---

## Decisions

- **CSC messaging canonical UI is the Help Center CSC side panel** for the reviewed client portal CTAs.
- **Document requests remain restricted to explicit document request CTAs** and use the shared document request modal.
- **Notification navigation should target Inbox tabs directly**, not stale redirect routes.
- **Legacy message links are handled in the Inbox page itself**, not by rewriting every notification link globally. This keeps the compatibility fix narrow and avoids changing non-message notification routing.
- **No DB cleanup performed.** Existing historical notification rows can continue to store legacy `conversation=` links; the frontend now tolerates them.

---

## Open questions parked

- Some historical migrations still generate or document `conversation=` links. No migration/database update was made in this session.
- `ClientInboxPage` still contains a separate `resolveNotificationLink()` helper that converts `conversation=` to `thread=` for full Inbox notifications. It is now redundant for correctness but harmless.
- The older/shared `DashboardLayout` still contains a client-facing `Notifications` menu item pointing at `/client/notifications`. It was intentionally left out of this focused client portal pass.

---

## Tag

`audit-2026-05-14-client-portal-cta-routing`
