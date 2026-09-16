# 2026-09-16 — TOM P1.2-c repository retirement prepared

## Scope and authorization

Carl explicitly approved making the retirement durable at repository level and
waived the previously planned 60-minute observation for the next execution.
This entry records only the repository change; it does not itself authorize a
new hosted deletion or any data, migration, credential, or rollback action.

## Repository change

Commit `b771e3f7e` on the dedicated branch removes the tracked
`supabase/functions/activate-ghost-user/index.ts` source and the empty
directory, removes `[functions.activate-ghost-user]` from `supabase/config.toml`,
and removes the stale current-mode references from the invitation sender
documentation/comments and tenant-ID sweep. The retirement guard test now
asserts that the source directory and config stanza remain absent.

The current repository no longer supplies this function to the Supabase Git
sync integration. Historical audit, migration, and compatibility references
remain labelled as historical where they are needed for provenance.

## Verification

- focused retirement and tenant-body tests: 15/15 passed;
- `npm run lint:ratchet`: passed;
- `npm run typecheck`: passed;
- `npm run test:frontend`: 587 passed, 43 skipped;
- `npm run test:edge`: 315 passed;
- `check-kb-links`: 168 files, 1459 local links, 0 broken;
- `git diff --check`: clean.

## Hosted disposition

The production control plane still needs a separate deletion of the currently
present `activate-ghost-user` deployment after the repository change is
merged. The waived observation means the next post-delete check is immediate
read-only verification rather than another 60-minute wait. Until that hosted
deletion and verification occur, P1.2-c remains open.
