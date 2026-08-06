# Audit: 2026-05-11 — bug-018-email-delivery-investigation

**Trigger:** ad-hoc — BUG-018 investigated and closed as non-issue
**Author:** Khian (Brian)
**Scope:** Reported that invitation emails were not reaching Gmail. Full diagnostic run on 11 May 2026 covering edge function logs, database invite records, and Mailgun delivery logs.

---

## Findings

- **No bug found.** The invitation email to `khiandagwapo@gmail.com` (sent 10 May 2026 23:57 UTC) was accepted and delivered by Mailgun. Gmail's SMTP server returned `2.0.0 OK` confirming delivery. Mailgun message ID: `<20260510235737.a76e2c6959fce371@mg.unicorn-cms.au>`.
- The `user_invitations` record was correctly written with status `pending`, Mailgun message ID stored, and expiry set to 17 May 2026. Edge function `send-invitation-email` operated correctly end-to-end.
- **Root cause of reported non-receipt:** Gmail categorised the email into the Promotions tab rather than the primary inbox. User had not checked Promotions. No app or infrastructure defect.
- **Secondary report (redirect after signup):** After accepting the invite and creating a new account, the user was redirected to the superadmin's dashboard instead of the new account. Root cause: the superadmin was already logged in on the same browser. Supabase Auth used the existing session. Not a bug — expected browser session behaviour. QA testing of invite flows must use an incognito or separate browser window.
- **Mailgun region note:** Mailgun dashboard is configured in the EU region (`MAILGUN_REGION=eu`). Searching for delivery logs must be done in the EU region view, not US, otherwise results appear empty. Worth documenting for future debugging.

## KB changes shipped

- No KB changes this session.

## Codebase observations (read-only)

- `send-invitation-email` edge function confirmed working correctly.
- `user_invitations` table confirmed correctly capturing Mailgun message IDs for delivery tracking.

## Decisions

- BUG-018 closed as non-issue. No fix required.
- Redirect-after-signup non-bug closed. No fix required.

## Tag

`audit-2026-05-11-bug-018-email-delivery-investigation`
