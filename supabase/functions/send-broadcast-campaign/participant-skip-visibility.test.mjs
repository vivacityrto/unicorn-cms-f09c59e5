import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// Phase 4 P6-4: a participant skipped by the row-by-row FK-safe fallback
// (2026-08-25 incident guardrail) must be surfaced in broadcast_recipients
// and total_failed, not just console.error'd -- otherwise a partially
// failed tenant is reported as fully "sent" with no visible trace anywhere
// staff would look.

assert.match(
  source,
  /const skippedUserIds = new Map<string, string>\(\);/,
  'must track which participants were skipped by the row-by-row fallback, keyed by user_id',
);

const rowByRowRetryIndex = source.indexOf('retrying row-by-row');
const skippedSetIndex = source.indexOf('skippedUserIds.set(row.user_id, rowErr.message)');
assert.ok(rowByRowRetryIndex > -1, 'must retain the row-by-row FK-safe retry');
assert.ok(skippedSetIndex > -1, 'a skipped row must be recorded, not only logged');
assert.ok(rowByRowRetryIndex < skippedSetIndex, 'the skip must be recorded inside the row-by-row retry loop');

// The tenant-wide "mark as sent" must exclude skipped recipients rather
// than blanket-marking every recipient row for the tenant as sent.
assert.match(
  source,
  /const skippedRows = skippedUserIds\.size > 0[\s\S]*?rows\.filter\(\(r\) => skippedUserIds\.has\(r\.user_id\)\)/,
  'skipped recipients must be identified by user_id before marking rows sent',
);
assert.match(
  source,
  /delivery_status: "failed",[\s\S]{0,120}failure_reason: `Participant could not be added: \$\{skippedUserIds\.get\(skipped\.user_id\)\}`/,
  'a skipped recipient must be marked failed with a reason, not left as sent',
);

// totalFailed must actually increase for a skipped recipient within an
// otherwise-successful tenant -- previously totalSent counted every row in
// the tenant unconditionally, which is exactly the bug being closed here.
const totalFailedIncrementIndex = source.indexOf('totalFailed += skippedRows.length;');
assert.ok(totalFailedIncrementIndex > -1, 'totalFailed must count skipped recipients within an otherwise-successful tenant');

console.log('send-broadcast-campaign participant-skip-visibility checks passed');
