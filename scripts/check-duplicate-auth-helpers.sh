#!/usr/bin/env bash
# Fail the build if a second requireCaller*.ts or auth-helpers*.ts file
# appears under supabase/functions/_shared/.
#
# See AGENTS.md -> "Edge Function security guardrails". A duplicate
# implementation of the canonical auth-gate helper is how a fix lands in one
# copy and not the other -- unlike the auth-gate presence check, this scans
# the whole tree every run, since a second copy is never legitimate
# regardless of which PR introduced it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SHARED_DIR="supabase/functions/_shared"
failed=0

for pattern in 'requireCaller*.ts' 'auth-helpers*.ts'; do
  matches="$(find "$SHARED_DIR" -maxdepth 1 -name "$pattern" ! -name '*.test.ts' 2>/dev/null | sort)"

  # requireCaller-helpers.ts is a deliberate, single companion file to
  # requireCaller.ts (not a duplicate implementation) -- exclude it from the
  # requireCaller* count.
  if [[ "$pattern" == 'requireCaller*.ts' ]]; then
    matches="$(echo "$matches" | grep -v '/requireCaller-helpers\.ts$' || true)"
  fi

  count="$(echo "$matches" | grep -c . || true)"

  if [[ "$count" -gt 1 ]]; then
    echo "ERROR: multiple files match $pattern under $SHARED_DIR/:"
    echo "$matches"
    echo
    failed=1
  fi
done

if [[ "$failed" -eq 1 ]]; then
  echo "Consolidate into a single implementation before merging -- a second"
  echo "copy is how a fix lands in one and not the other."
  exit 1
fi

echo "duplicate-auth-helpers check passed"
