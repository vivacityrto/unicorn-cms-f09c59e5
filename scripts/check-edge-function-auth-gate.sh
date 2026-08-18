#!/usr/bin/env bash
# Fail the build when a new or modified supabase/functions/*/index.ts has no
# recognizable authorization check anywhere in the file.
#
# See AGENTS.md -> "Edge Function security guardrails" for the incidents this
# guards against: sync-clickup-tasks shipped with no authorization at all
# (2026-08-18, PR #341), and several functions had a gate on only some of
# their action branches. This is a coarse presence check, not a logic
# checker -- it cannot tell whether an imported/called auth helper is
# actually enforced correctly, only that the file contains no recognizable
# attempt at one.
#
# Only diffs new/modified files against the PR's base ref, never the whole
# tree -- pre-existing functions using an idiom this script doesn't
# recognize yet are never retroactively flagged, only newly-touched ones.
#
# Legitimate exception: a function with genuinely no per-request caller to
# authenticate (e.g. a retired 410 stub) may opt out with a same-file marker
# comment: `// auth-gate: none -- <reason>`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE_REF="${1:-${BASE_SHA:-origin/main}}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "auth-gate check: base ref '$BASE_REF' not found locally, skipping (nothing to diff against)"
  exit 0
fi

# --diff-filter=d (lowercase) EXCLUDES deletions and keeps everything else --
# added, copied, modified, AND renamed. A file that is renamed and edited in
# the same PR (e.g. moving a function directory while quietly dropping its
# auth call) must still be checked; --diff-filter=ACM would classify a
# rename as status R and silently skip it entirely (found in review).
changed_files="$(git diff --name-only --diff-filter=d "$BASE_REF"...HEAD -- 'supabase/functions/*/index.ts' \
  | grep -v '^supabase/functions/_shared/' || true)"

if [[ -z "$changed_files" ]]; then
  echo "auth-gate check: no new/modified supabase/functions/*/index.ts files"
  exit 0
fi

# Any one of these appearing anywhere in the file counts as "has an
# authorization attempt" -- the codebase uses several legitimate idioms side
# by side (the shared requireCaller() helper, a function's own inline
# auth.getUser()+check_permission() pair, cron-secret gating, webhook
# signature verification), not just one canonical helper.
AUTH_PATTERN='requireCaller\(|requireSharedSecret\(|requireInternalEmailSecret\(|requireSuperAdmin\(|isCronAuthorized\(|checkSuperAdmin\(|check_permission|auth\.getUser\(|auth\.getClaims\(|verifyAuth\(|MAILGUN_WEBHOOK_SIGNING_KEY|constantTimeEqual\('

failed=0
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  [[ -f "$file" ]] || continue # deleted file, nothing to check

  if grep -qE "// *auth-gate: *none\b" "$file"; then
    echo "SKIP (opted out): $file"
    continue
  fi

  if ! grep -qE "$AUTH_PATTERN" "$file"; then
    echo "MISSING AUTH GATE: $file"
    failed=1
  fi
done <<< "$changed_files"

if [[ "$failed" -eq 1 ]]; then
  echo
  echo "ERROR: one or more new/modified edge functions have no recognizable"
  echo "authorization check. Add one of the shared helpers, an inline"
  echo "auth.getUser()+check_permission() gate, or -- if this function"
  echo "genuinely has no per-request caller to authenticate -- opt out with"
  echo "a same-file comment: // auth-gate: none -- <reason>"
  exit 1
fi

echo "edge-function-auth-gate check passed"
