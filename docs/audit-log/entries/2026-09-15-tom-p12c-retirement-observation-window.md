# 2026-09-15 — TOM P1.2-c observation window approved

## Decision

Carl approved a minimum 60-minute observation window after the verified
disable of `activate-ghost-user` in `unicorn-qa`.

## Boundary

The operator may abort or roll back earlier if any packet threshold fires.
A clean 60-minute observation does not authorize direct deletion; deletion
requires a separate target check and explicit approval. This approval does not
authorize production work, unattended scheduling, account repair, invitation,
job mutation, migration, credential change, or any hosted action before the
full preflight passes.
