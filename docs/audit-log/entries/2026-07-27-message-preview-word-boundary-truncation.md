# Audit: 2026-07-27 — Message preview word-boundary truncation

**Trigger:** ad-hoc — Carl reported message bubble text cutting off words on the Team Communications page; investigation surfaced a second, related bug on the dashboard.
**Scope:** message bubble CSS in `ConversationPanel`, and the `fn_tm_on_message_insert` trigger that populates `tenant_conversations.last_message_preview` / notification text. Did not audit other `left(...)` truncation sites found in passing (e.g. `em.body_preview` in an email/ticket preview view).

---

## Findings

- **Bug 1 (frontend, CSS only):** `ConversationPanel` message bubbles combined `overflow-wrap:anywhere` with `word-break:break-all` on the message text. `break-all` forces a break between any two characters regardless of whether the word would fit on the next line, so ordinary words split mid-character (e.g. "bounced" rendered as "bo"/"unced"). Reproduced visually in local dev (connected to prod Supabase — no staging exists) against a real conversation thread before and after the fix.

- **Bug 2 (backend, DB trigger):** the dashboard's "Client Messages" panel and the Team Communications page's thread list both read `tenant_conversations.last_message_preview`, which is written by `fn_tm_on_message_insert()` using `left(NEW.body, 200)` — a hard character-count cut with no word-boundary awareness and no ellipsis. This produced previews like "...At this s" with no indication of truncation. Confirmed via `pg_get_functiondef` that the live production function matched the git migration exactly (no drift). The same `left(NEW.body, 200)` pattern also fed the notification `message` text for in-app notifications, so truncated/word-split previews also reached `user_notifications`.

- Same anti-pattern (`left(text, N)` with no word boundary) also appears in an unrelated email/ticket preview view (`em.body_preview`, migration `20260217023259`) — not investigated further this session, flagged as a possible future cleanup.

---

## KB changes shipped

- unicorn-kb: no changes.

---

## Codebase observations (read-only)

- unicorn-cms-f09c59e5: two hand-applied hotfixes, both under explicit in-session override (Lovable territory, override granted for this session per root CLAUDE.md):
  - unicorn-cms-f09c59e5 @ `348e6b37e18dde0bedc5cb89fa2a2087cfc71337` (`hotfix/2026-07-27-comms-bubble-word-break`, PR #50): drops `word-break:break-all` from both message bubble variants in `ConversationPanel.tsx`. Not merged yet.
  - unicorn-cms-f09c59e5 @ `f53efb7112db47a5714d4fdac429b4a4b4c3ec79` (`hotfix/2026-07-27-message-preview-word-boundary`, PR #51): adds `public.fn_truncate_preview(text, max_len)` (trims to the last whole word within budget, appends `…`, falls back to a hard cut only if a single word exceeds the budget) and switches both `left(NEW.body, 200)` call sites in `fn_tm_on_message_insert()` to use it. Migration not yet applied to production — this repo's CI (`deploy-supabase.yml`) runs `supabase db push` only on push to `main`, so it takes effect on merge, not before. Not merged yet.

---

## Decisions

- Kept the two fixes as separate PRs rather than one bundled commit: different risk/review profile (pure CSS vs. a production trigger function), and only the trigger change needs this audit entry.
- Scoped the trigger fix to forward-looking only. Did not backfill existing `tenant_conversations.last_message_preview` rows that are already hard-truncated by the old logic — a data backfill is a separate risk category from a function definition change and wasn't asked for. Existing stale previews will self-correct on that conversation's next message.
- Did not run this through the full Lovable production DB change workflow (audit/design/plan/phased-implementation/dry-run) — Carl explicitly opted for the hotfix-branch path instead, consistent with the root CLAUDE.md override clause covering hand-written migrations as an alternative to a Lovable prompt.

---

## Open questions parked

- Whether to backfill existing truncated `last_message_preview` rows so old threads look right immediately, rather than waiting for their next message.
- The `em.body_preview` truncation site (email/ticket previews) — same anti-pattern, not yet checked for the same word-split symptom.
- Once PR #51 merges, confirm on a real >200-char message that the preview no longer splits mid-word (test plan item left unchecked in the PR).

---

## Tag

`audit-2026-07-27-message-preview-word-boundary-truncation`
