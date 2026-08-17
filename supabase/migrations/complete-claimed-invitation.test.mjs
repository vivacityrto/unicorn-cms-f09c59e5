import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("./20260817090000_complete_claimed_invitation.sql", import.meta.url),
  "utf8",
);
const privilegeMigration = readFileSync(
  new URL("./20260817090100_revoke_anon_complete_claimed_invitation.sql", import.meta.url),
  "utf8",
);
const invitationPage = readFileSync(
  new URL("../../src/pages/AcceptInvitation.tsx", import.meta.url),
  "utf8",
);

test("claimed invitations are locked before canonical completion", () => {
  assert.match(migration, /WHERE token_hash = p_token_hash\s+FOR UPDATE;/s);
  assert.match(migration, /SET status = 'pending'/);
  assert.match(migration, /RETURN public\.accept_invitation_v2\(p_token_hash, p_user_id\)/);
  assert.match(migration, /auth\.uid\(\) IS NULL OR auth\.uid\(\) <> p_user_id/);
});

test("ghost password activation uses the claimed-invitation completer", () => {
  assert.match(invitationPage, /rpcName = options\.claimedPasswordActivation\s*\? 'complete_claimed_invitation'/s);
  assert.match(invitationPage, /finalizeInvitation\(signInRetry\.user\.id, tokenHash, \{\s*claimedPasswordActivation: true,\s*\}\)/s);
});

test("only signed-in callers retain execute permission", () => {
  assert.match(privilegeMigration, /REVOKE EXECUTE ON FUNCTION public\.complete_claimed_invitation\(text, uuid\) FROM anon/);
  assert.match(privilegeMigration, /GRANT EXECUTE ON FUNCTION public\.complete_claimed_invitation\(text, uuid\) TO authenticated/);
});
