# Audit: 2026-11-20 — client-insights-edge-function

**Trigger:** Carl asked to finish the AI summary for the client portal, and said AI must only run when a person presses a button (like Viv's insight), with everything else calculated by code.
**Scope:** one new Edge Function, `client-insights` (and shared modules `_shared/client-insights.ts`, `_shared/client-ai-limits.ts`), a `[functions.client-insights]` entry in `supabase/config.toml`, and the portal button card. No migration, table, column, policy or data change.
**Status:** In the pull request. **Merging deploys the function to production** (Edge Functions deploy on merge to `main`), so it needs Carl's explicit merge go-ahead.

## Behaviour

- Runs only when a person presses "Ask Viv for an insight" on Home, Packages or Academy Activity. Nothing runs when a page opens. The always-on "At a glance" cards are plain calculations and use no AI.
- A result is kept in the browser for 30 minutes; pressing again inside that time does not call the function or the model.
- The model (Claude Haiku, forced tool call, no temperature) only writes words. Facts are built on the server from the caller's own row-level-security reads (`get_client_package_dashboard`, `get_tenant_academy_learner_analytics`, the Home feed counts). No learner or staff names are sent.
- Every number in the model's answer is checked against the facts; a summary containing a number the facts do not contain is dropped (error `UNGROUNDED`) and never shown.

## Who can call it, in order

1. A signed-in, active user (`verifyAuth`).
2. A client user with exactly one active organisation, or Vivacity staff previewing one (`validateClientAskVivAccess`). The organisation always comes from this gate, never from the request. The body accepts only `surface` and (staff only) `preview_tenant_id`; any other field is refused.
3. An organisation that client AI is switched on for (`app_settings.ask_viv_client_assistant_*`, fails closed). At the time of writing production has it enabled for all organisations.
4. A person still inside today's token budget, shared with the client Ask Viv chat (`ask_viv_client_assistant_usage`), recorded after each call.

Academy figures are limited to the organisation's main contacts by the underlying function; for anyone else the Academy surface is refused and Home leaves the Academy line out.

## Cost

One Haiku call of at most 600 output tokens per press, at most one per person per surface per 30 minutes in the browser, and capped by the shared daily budget. The AI-drafted weekly snapshot for packages is not built; the weekly snapshot on the package page stays a plain calculation.

## Tests

Edge: 18 tests (auth gate order, forbidden body fields, grounding check, tool schema). Portal: 9 tests (no call on load, correct surface sent, 30-minute reuse, preview tenant only for staff, plain-words errors, hidden for Academy-only users).

**Rollback:** revert the pull request (the button disappears); to stop spend without a deploy, switch `ask_viv_client_assistant_enabled` off, and the button then shows "not switched on for your account yet".
