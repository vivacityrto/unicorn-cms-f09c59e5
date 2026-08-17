# Audit: 2026-08-17 — EOS RLS role-type regression

**Trigger:** post-security-remediation consequence audit
**Scope:** live `has_eos_role` function, `eos_user_roles.role`, and all live RLS policies invoking the helper.

## Findings

- `eos_user_roles.role` was converted to `text` in March 2026, but the enum overload of `has_eos_role` still compared it directly with `eos_role`.
- The resulting `text = eos_role` operator error broke live EOS reads for Headlines, Segue shares, Issues, and Meeting Summaries.
- Production logs for the 24 hours ending 2026-08-17 recorded 316 `eos_issues`, 18 `eos_segue_shares`, 2 `eos_headlines`, and 1 `eos_meeting_summaries` failed reads associated with this error.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- `20260817093000_fix_eos_role_helper_text_comparison.sql` casts the enum parameter to `text` inside the canonical helper.
- `20260817093100_revoke_anon_eos_role_helper.sql` removes a pre-existing direct `anon` EXECUTE grant; revoking `PUBLIC` alone does not remove direct grants.

## Decisions

- Correct the helper rather than weaken the client-viewer RLS policies; all four policies retain their existing authorization semantics.

## Open questions parked

- The recent policy-optimisation migrations that made the latent helper failure user-visible are recorded in production but absent from the repository. Reconcile those migration sources separately.
