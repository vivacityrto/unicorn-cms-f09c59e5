# 2026-09-15 — TOM P1.2-c disable-first action shape approved

## Decision

Carl approved the reversible action shape for the target-specific TOM P1.2-c
packet: **disable `activate-ghost-user` first in `unicorn-qa`**, with direct
deletion deferred until after a separate clean observation and explicit
approval.

## Boundary

This decision approves the sequence shape only. It does not authorize the
disable operation yet, and it does not authorize deletion, redeployment,
production work, job mutation, account repair, invitation, migration,
credential change, or any other hosted action. Timing, rollback ownership, and
the observation window remain open decisions. The function remains deployed
and the fail-closed guards and non-destructive holds remain unchanged.
