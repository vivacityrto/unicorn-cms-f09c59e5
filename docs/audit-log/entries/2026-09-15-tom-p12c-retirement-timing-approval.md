# 2026-09-15 — TOM P1.2-c supervised QA timing approved

## Decision

Carl approved executing the disable-first QA action in the next supervised QA
window, immediately after the final preflight passes.

## Boundary

No unattended or scheduled run is authorized. The operator must re-confirm the
allowlisted `unicorn-qa` target, guards, held job/account state, rollback
readiness, and all remaining gates immediately before acting. Any failed or
ambiguous preflight aborts without action. Production remains out of scope;
direct deletion remains deferred and separately gated.

No hosted action occurred as part of this approval.
