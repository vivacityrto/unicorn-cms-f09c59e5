## Status
✅ Migration already applied — `email_messages.body_html text` column exists, comment set, PostgREST schema reloaded. No RLS or grant change required.

Below are the exact, ready-to-apply code edits. Approving this plan flips to build mode and I'll execute them in one batch.

---

## 1. `supabase/functions/capture-outlook-email/index.ts`

**1a. `refresh-linked-email-metadata` update payload (line 298–308)** — add one line:
```ts
.update({
  subject: emailData.subject,
  sender_email: emailData.from?.emailAddress?.address,
  sender_name: emailData.from?.emailAddress?.name,
  received_at: emailData.receivedDateTime,
  has_attachments: emailData.hasAttachments || false,
  body_preview: previewText.substring(0, 900) || null,
  body_html: emailData?.body?.content ?? null,   // NEW
  ai_summary: aiSummary,
})
```

**1b. `link-email` insert payload (line 361–378)** — add one line:
```ts
.insert({
  user_uuid: userId,
  tenant_id: parseInt(tenant_id),
  ...
  body_preview: previewText.substring(0, 900) || null,
  body_html: emailData?.body?.content ?? null,   // NEW
  ai_summary: aiSummary,
  ...
})
```

`fetchGraphEmail` already selects `body`, so no Graph query change.

---

## 2. `supabase/functions/addin-email-capture/index.ts` (line 181–182)

Rename `body_content` → `body_html`, drop `body_content_type`:
```ts
// before
body_content: graphEnrichment?.body?.content || null,
body_content_type: graphEnrichment?.body?.contentType || null,

// after
body_html: graphEnrichment?.body?.content || null,
```
This also resolves a latent bug — those two columns never existed, so PostgREST was silently rejecting the keys.

---

## 3. `src/hooks/useLinkedEmails.tsx`

**3a. `LinkedEmail` interface (line 20)** — add `body_html`:
```ts
external_message_id: string | null;
body_html: string | null;   // NEW
```

**3b. Enrichment trigger (line 183)** — add `|| !email.body_html`:
```ts
(!email.ai_summary || !email.body_preview || email.body_preview.length < 320 || /[\r\n]/.test(email.body_preview) || !email.body_html)
```

---

## 4. `src/components/email/EmailViewDialog.tsx` (replace lines 11–88)

- Add `bodyHtml?: string | null` to the prop interface.
- Destructure as `bodyHtml: bodyHtmlProp` to avoid shadowing state.
- Initialise state from the prop: `useState<string | null>(bodyHtmlProp ?? null)`, `useState<boolean>(!!bodyHtmlProp)`.
- On open: if `bodyHtmlProp` present → seed state, mark fetched, no fetch. Else if `outlookMessageId` → call existing Graph fetch (renamed `fetchBodyFromGraph`). Else → silent fallback, no error toast.
- On close: reset to `bodyHtmlProp ?? null` / `!!bodyHtmlProp`.

(Exact replacement block was prepared and is ready to apply on build-mode switch.)

---

## 5. `src/components/email/LinkedEmailsList.tsx` (line 156)

Thread the prop:
```tsx
<EmailViewDialog
  ...
  externalMessageId={email.external_message_id}
  bodyHtml={email.body_html}   // NEW
  ...
/>
```

---

## 6. `src/components/client/ClientStructuredNotesTab.tsx` (line 1787)

Thread the prop:
```tsx
<EmailViewDialog
  ...
  externalMessageId={emailViewTarget?.external_message_id}
  bodyHtml={emailViewTarget?.body_html ?? null}   // NEW
  ...
/>
```
`emailViewTarget` is sourced from `email_messages` via `useLinkedEmails`/Supabase select; the regenerated types will expose `body_html` automatically. If a local interface narrows the type, add `body_html: string | null` to it.

---

## Deep-Dive Audit

**Database**
- `email_messages` columns now: `id, user_uuid, tenant_id, provider, external_message_id, subject, sender_email, sender_name, received_at, has_attachments, body_preview, body_html (NEW), client_id, package_id, task_id, created_at, updated_at, linked_at, ai_summary`.
- Indexes unchanged. No FK touches the new column. No triggers on the table.
- RLS SELECT already permits owner + Vivacity team + super-admins → matches confirmed privacy decision.
- INSERT/UPDATE policies scope to `user_uuid = auth.uid()`; service role (used by `refresh-linked-email-metadata`) bypasses RLS as expected.

**Edge functions**
- `capture-outlook-email`: link-email insert uses anon-keyed client (`supabase`) → RLS-checked on the linker's `user_uuid`. Refresh path uses `serviceClient` → bypasses RLS to heal old rows.
- `addin-email-capture`: uses `supabaseAdmin` upsert; after the rename, the payload finally matches the schema. `web_link`, `importance`, `is_read`, `categories`, `graph_enriched`, `graph_enriched_at` keys still don't exist on the table — that's a **pre-existing latent issue** outside this change's scope; flagging only.
- `sync-outlook-calendar` `get-email-body`: unchanged. Only EmailViewDialog calls it; we now call it only when the viewer owns the mailbox.

**Frontend**
- `LinkedEmail` interface ripples through `useLinkedEmails` consumers. `select("*")` already returns the new column; types regenerate after the migration.
- `LinkedEmailsList`/`EmailCard` and `ClientStructuredNotesTab` are the only `EmailViewDialog` callers — confirmed via ripgrep.
- `sanitizeHtml` continues to run at render only; stored HTML stays as-fetched.

**Backward compatibility**
- Old rows: `body_html IS NULL` → dialog falls back to preview silently, or original linker's enrichment loop refetches and populates.
- Old code paths (e.g. dialog without the new prop) still work — prop is optional and defaults preserve current behaviour for inbox-browse.
- No view/grant/policy change → no risk to FK constraints or RLS surface.

**Risk assessment**

| Risk | Severity | Mitigation |
|---|---|---|
| TOAST bloat from huge HTML bodies | Low/Med | Stored as-is per decision; revisit if observed. |
| Stored HTML XSS | Med | `sanitizeHtml` still gates every render. No raw `dangerouslySetInnerHTML` path bypasses it. |
| Linker token expired during opportunistic refresh | Low | Refresh fails silently; row stays NULL; dialog falls back to preview. |
| Old links remain NULL forever for non-linker viewers | Accepted | Decision #4 — opportunistic only. |
| Pre-existing `addin-email-capture` ghost columns (`web_link` etc.) | Pre-existing | Out of scope; flagged for separate ticket. |

**Verification (run after build-mode apply)**
1. Link a new email → `SELECT body_html IS NOT NULL` → true; opening dialog as linker shows body with zero `sync-outlook-calendar` network call.
2. Sign in as a different Vivacity staff user → open same email → body renders, no Graph call.
3. Open a legacy `body_html IS NULL` row as the original linker → within seconds enrichment loop populates `body_html`; subsequent opens skip Graph.
4. Open same legacy row as a non-linker → preview fallback only, no error toast.
5. `addin-email-capture` logs → no more "column body_content does not exist" warnings.
6. Anon role → `SELECT body_html FROM email_messages` still denied.

---

## Summary
**Changes**: 1 migration (done) + 6 file edits (2 edge functions, 1 hook, 3 components).
**Benefits**: Linked emails viewable by entire Vivacity team without the viewer owning Outlook tokens; eliminates a doomed Graph call for non-linker viewers; fixes silent add-in column-name bug; old rows self-heal opportunistically.
**Net risk**: Low — additive, nullable, RLS unchanged, sanitisation preserved.