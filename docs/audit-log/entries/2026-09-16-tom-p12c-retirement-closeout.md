# 2026-09-16 — TOM P1.2-c `activate-ghost-user` retirement closeout

- **Initiative:** Tenant Operating Model, P1.2-c ghost activation retirement
- **Authority:** Carl approved the repository retirement, permanent hosted deletion, and waiver of the planned 60-minute observation during this session.
- **Operator:** Codex
- **Target:** Supabase project `yxkgdalkbrriasiyyrwk` (`1. Unicorn 2.0-dev`, `main` / PRODUCTION)
- **Repository:** PR #1381 merged as `ae2ec1db52cd37e5da3a81dff2f4bdac4d35e4fb`; source/configuration retirement was included in that merged PR.

## Action and immediate verification

After PR #1381 merged, the hosted `activate-ghost-user` Edge Function was
permanently deleted through the authorized Supabase control plane. No
invitation, account, job, migration, schema, RLS, credential, or unrelated
function write was performed.

Immediate read-only verification returned:

- Edge Function inventory: **192**; exact `activate-ghost-user` lookup: **absent**.
- `bulk-account-actions`: **ACTIVE v287**, with `GHOST_ACTIVATION_RETIRED` guard present.
- `cohort-access-sender-worker`: **ACTIVE v286**, with `GHOST_ACTIVATION_RETIRED` guard and reset-only path present.
- Activation jobs: 4 total; 0 running; 0 failed; 2 cancelled; 2 completed.
- Activation items: 0 locked and unprocessed; 2 pending historical items remain held.
- Recent `ghost_user_activated` audit events since `2026-09-16T01:38:00Z`: **0**.
- Target request logs in the immediate read-only window `2026-09-16T01:40:00Z`–`2026-09-16T01:46:00Z`: **0**.

The earlier redeployment exception is therefore reconciled: the repository
source/configuration was retired before the hosted deletion, preventing the
previous Git/Supabase recreation path. The 60-minute observation was waived;
the immediate checks above are the closeout evidence. No further hosted action
is authorized by this entry.
