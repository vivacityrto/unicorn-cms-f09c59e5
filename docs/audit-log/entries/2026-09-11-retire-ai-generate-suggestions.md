# Audit: 2026-09-11 — retire ai-generate-suggestions Edge Function

**Trigger:** drift-surfaced (RBAC v6 Packet P0.1-a's 14 "no recognized auth-gate" candidates, triaged this session)
**Scope:** `supabase/functions/ai-generate-suggestions/index.ts` and its frontend/RPC callers. Did not investigate the other 13 flagged functions' remediation beyond their own triage write-up (see `docs/kb/reference/rbac-v6/p0/p0-1-a-static-inventory.md`).

## Findings

- P0.1-a's static inventory flagged 14 Edge Functions with no recognized auth-gate import. Manual triage of all 14 found 12 were false positives (real gates the guardrail script's pattern doesn't recognize by name — `verifyAddinToken(` for 7 add-in functions, `authorizeCronInvoke(` for 2 cron functions, a SECURITY DEFINER RPC delegation for `bulk-reassign-team-member`, and 2 legitimate public-data proxies with no tenant data at all).
- `generate-document-description` has no auth either, but touches no tenant data — a minor AI-cost-abuse surface, not actioned in this entry.
- `ai-generate-suggestions` was the one genuine gap: no auth check of any kind, accepts `tenant_id` directly from the request body with zero identity/role verification, doesn't even check that an `Authorization` header is present, then runs tenant-scoped EOS queries (`eos_scorecard_entries`, `eos_issues`, `eos_rocks`, `eos_todos`) and calls the paid Lovable AI gateway.
- Before treating this as a live-fix candidate, checked reachability per this repo's standing practice: `docs/kb/reference/codebase-optimization/cross-cutting/dead-code-feature-consolidation-investigation.md` already recorded (2026-09-08, Phase 2.6 P6-B) that this function's only frontend caller, `useAISuggestions.tsx`, was retired as dead code, and that neither the Edge Function nor the `accept_ai_suggestion` RPC has any other frontend caller. The `ai_suggestions` table was confirmed empty (0 rows) at that time. The Edge Function itself was explicitly left untouched then — orphaned, not removed.
- Re-confirmed today: `grep -rn "ai-generate-suggestions"` across `src/` returns zero matches; no `supabase/config.toml` entry; no test file; no other `supabase/` reference.

## KB changes shipped

- `docs/kb/reference/rbac-v6/p0/p0-1-a-static-inventory.md` @ this PR: not modified (the original finding stands as written; this entry is the follow-up triage/action).

## Code changes (if this entry accompanies one)

- This PR: deleted `supabase/functions/ai-generate-suggestions/` entirely. The `ai_suggestions` table and `accept_ai_suggestion` RPC are left untouched, matching the 2026-09-08 precedent's disposition — retiring the orphaned public HTTP endpoint closes the real exposure (anyone with the URL could invoke it, feed it any `tenant_id`, and burn AI API quota, with RLS as the only backstop) without touching data or RPCs nothing here investigated.

## Decisions

- Confirmed with Carl (2026-09-11): retire rather than patch, since the function has no live caller — matches this repo's standing dead-code-retirement practice rather than hardening code nobody uses.
- Guardrail script (`scripts/check-edge-function-auth-gate.sh`) separately updated in this same PR to recognize `verifyAddinToken(` and `authorizeCronInvoke(` as valid gates, so the 9 add-in/cron false positives don't need re-triaging in a future audit.

## Open questions parked

- `generate-document-description`'s no-auth cost-abuse surface — not actioned here, flagged in the P0.1-a doc's triage note only.
- The other 13 functions' guardrail-recognition status: `bulk-reassign-team-member` (RPC-delegated) and the 2 TGA public-data proxies (`tga-search-training`, `tga-rto-preview`) still won't match the guardrail's pattern and would still show up in a future audit — not fixed here since they're legitimately different auth models (RPC delegation, no-caller-to-authenticate), not a naming gap like the other 9.
