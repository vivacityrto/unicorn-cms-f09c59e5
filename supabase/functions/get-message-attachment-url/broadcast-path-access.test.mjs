import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// Broadcast attachments live under `broadcast/{campaign_id}/...`, not
// `{tenant_id}/...`. Treating the first segment as a tenant id denied every
// client recipient, so the gate must resolve access through the message rows
// that actually carry this exact storage_path.
assert.match(source, /const BROADCAST_SEGMENT = "broadcast";/, 'must name the broadcast path segment');
assert.match(
  source,
  /tenantSegment === BROADCAST_SEGMENT[\s\S]*?allowBroadcastRecipient\(svc, userId, storage_path\)/,
  'broadcast paths must be authorised via allowBroadcastRecipient',
);
assert.match(
  source,
  /\.from\("tenant_message_attachments"\)[\s\S]*?\.eq\("storage_path", storagePath\)/,
  'access must be tied to an attachment row with the exact storage_path',
);
assert.match(
  source,
  /\.from\("tenant_users"\)[\s\S]*?\.in\("tenant_id", tenantIds\)/,
  'caller must be a member of a tenant that received the message',
);

// An unrecognised first segment must fail closed, not fall back to a
// string tenant_id comparison against an integer column.
assert.doesNotMatch(source, /\.eq\("tenant_id", tenantSegment\)/, 'no string tenant_id fallback');

console.log('get-message-attachment-url broadcast access: ok');
