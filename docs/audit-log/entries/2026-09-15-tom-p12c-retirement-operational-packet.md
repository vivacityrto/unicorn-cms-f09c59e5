# 2026-09-15 — TOM P1.2-c operational retirement packet prepared

## Scope and authorization

This entry records preparation of a planning-only operational packet for the
legacy `activate-ghost-user` Edge Function. It is not authorization to disable,
delete, redeploy, or otherwise change the function or any hosted state. No
schema, RLS, trigger, cron, invitation, account, job, credential, or
production action occurred.

## Read-only target observation

The connected Supabase control plane reported the exact target as:

- project ref `qfpxvumcrnzrjyvqkicq`;
- function `activate-ghost-user`, ID
  `28e6a1be-5a06-41e1-a47b-cb5ca6fb68c4`;
- status `ACTIVE`, version `304`, `verify_jwt=false`;
- entry point `supabase/functions/activate-ghost-user/index.ts`; and
- deployment digest
  `61e22bd035e5aba3bea946d17a54b6f42d33a34d1299736c87e28f58063f5ec4`.

The metadata was used only to make the future packet target-specific. No
function source, credentials, or identifiers were committed or exported.

## Packet disposition

The packet recommends a reversible disable-first sequence, followed by a
separate approval for any deletion. It requires Carl to specify the exact
environment, action, timing, rollback owner, observation window, and post-
action checks before execution. The merged fail-closed guards and current
non-destructive holds remain the safe state. The Edge Function remains
deployed and retirement remains unauthorized.
