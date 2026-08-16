#!/usr/bin/env bash
# Fail the build when a token-bearing link key appears in an edge function
# without APP_BASE_URL on the same line.
#
# Same failure class as the 2026-06-04 redirect incident: a request header
# or body supplied the base URL of a magic/recovery link. Every remaining
# hit must be reviewed — none may draw its base URL from req.headers or
# the request body.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

hits="$(grep -rnE "action_link|redirect_to|redirectTo|emailRedirectTo" supabase/functions/ \
  | grep -vE "APP_BASE_URL" || true)"

if [[ -n "$hits" ]]; then
  echo "ERROR: token-bearing link key without APP_BASE_URL on the same line:"
  echo
  echo "$hits"
  echo
  echo "Token-bearing links must be built from APP_BASE_URL, never from req.headers or the request body."
  exit 1
fi

echo "email-redirect-url check passed"
