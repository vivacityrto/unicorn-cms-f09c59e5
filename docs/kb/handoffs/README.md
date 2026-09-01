# Handoffs — Scenario Lookup

> **Last updated:** 2026-04-24 · **Reconsider by:** 2026-07-24 · **Confidence:** high.
>
> Find the handoff that matches your scenario. Organised by **what you're
> trying to do**, not by tool. If no row fits, you probably don't need a
> handoff — just do the work.

---

## Lookup

| If you… | Use |
|---|---|
| Were brainstorming in claude.ai, reached a decision, now need to implement or record | [claude-project-to-claude-code.md](claude-project-to-claude-code.md) |
| Are pulling in a feature Lovable shipped to `<codebase>/` | [lovable-to-codebase.md](lovable-to-codebase.md) |
| Are reconciling after a Lovable remix (Carl only) | [post-lovable-remix.md](post-lovable-remix.md) |
| Are a non-technical stakeholder with a KB proposal | [non-technical-proposal.md](non-technical-proposal.md) |
| Are implementing a production database change via Lovable (migrations, FKs, triggers, RLS, data fixes) | [lovable-production-db-change.md](lovable-production-db-change.md) |
| Need Codex or Claude to inspect Supabase without write access | [supabase-mcp-read-only.md](supabase-mcp-read-only.md) |
| Ask Viv crashes or compliance mode is broken ("Something went wrong") | [ask-viv-fix-procedure.md](ask-viv-fix-procedure.md) |
| Are implementing the client portal Tasks overhaul (stage tasks + action items unification) | [tasks-overhaul-plan.md](tasks-overhaul-plan.md) |

---

## Everything else in this folder

The lookup above covers standing procedures. It's not the full folder —
`docs/kb/handoffs/` also holds feature-specific implementation plans and
build-prompt sequences, most now historical (shipped or superseded). For
the lifecycle status of every file here (this table included), see
[`../reference/README.md`](../reference/README.md).

| File | What it was for |
|---|---|
| `ask-viv-client-mode.md` | Original client-facing Ask Viv build spec — superseded, the function it scoped was retired |
| `dashboard-metrics-fix.md` | Dashboard metrics fix plan — not yet implemented |
| `dashboard-overhaul-lovable-prompts.md` | Main Dashboard overhaul Lovable prompt sequence |
| `email-triage-module.md` | Email Triage module implementation plan |
| `eos-meeting-overhaul-plan.md` | EOS meeting overhaul — still in scoping/draft |
| `impersonation-improvements-plan.md` | "View as Client" impersonation improvements — shipped |
| `pdp-follow-up-prompts.md` | PDP module follow-up prompts (gaps in the original build) |
| `pdp-lovable-prompts.md` | Original PDP module build prompts |
| `rbac-v5-implementation-plan.md` | RBAC v5 — shipped, all 8 phases done |
| `rbac-v6-gate-closure-plan.md` | RBAC v6 gate-closure planning — not yet implemented |
| `tasks-overhaul-plan.md` | Tasks feature overhaul (stage tasks + action items unification) — shipped |

## Not a handoff

Don't reach for a handoff if you're:

- Doing a self-contained Claude Code session that touches one repo and
  commits normally. That's just work.
- Asking Claude a question in chat that doesn't change any source of
  truth. That's just a conversation.
- Fixing a typo or re-dating a shelf-life header. That's a commit, not a
  ritual.

If you find yourself skipping a handoff that you should have used, log
that in [../reference/brainstorm-log.md](../reference/brainstorm-log.md) so
Carl can decide whether the handoff is wrong or the reminder loop is.
