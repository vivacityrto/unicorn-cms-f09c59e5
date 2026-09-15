import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../migrations/20260914230604_academy_solo_invitation_role_compatibility.sql", import.meta.url),
  "utf8",
);
const validationMigration = readFileSync(
  new URL("../../migrations/20260915020000_academy_solo_invitation_validation_context.sql", import.meta.url),
  "utf8",
);
const grantMigration = readFileSync(
  new URL("../../migrations/20260915010000_academy_solo_invitation_rpc_grant_hardening.sql", import.meta.url),
  "utf8",
);
const identityBindingMigration = readFileSync(
  new URL("../../migrations/20260915030000_academy_solo_invitation_anonymous_identity_binding.sql", import.meta.url),
  "utf8",
);
const invitationPage = readFileSync(
  new URL("../../../src/pages/AcceptInvitation.tsx", import.meta.url),
  "utf8",
);

test("Academy invitation acceptance preserves the relationship boundary and valid role vocabulary", () => {
  assert.match(migration, /WHEN 'academy_user'/);
  assert.match(migration, /v_tu_access_scope := 'academy_only'/);
  assert.match(migration, /v_u_unicorn_role := 'User'; v_u_user_type := 'Client Child'/);
  assert.match(migration, /v_tm_role := 'General User'; v_tm_status := 'inactive'/);
  assert.doesNotMatch(migration, /v_u_unicorn_role := 'Academy User'/);
});

test("anonymous invitation acceptance is bound to the invited auth identity", () => {
  assert.match(grantMigration, /REVOKE ALL ON FUNCTION public\.accept_invitation_v2\(text, uuid\) FROM PUBLIC, anon/);
  assert.match(grantMigration, /GRANT EXECUTE ON FUNCTION public\.accept_invitation_v2\(text, uuid\) TO authenticated, service_role/);
  assert.match(identityBindingMigration, /FROM auth\.users/);
  assert.match(identityBindingMigration, /lower\(email\) = lower\(v_invitation\.email\)/);
  assert.match(identityBindingMigration, /v_invited_auth_uuid IS NULL OR v_invited_auth_uuid <> p_user_id/);
  assert.match(identityBindingMigration, /TO anon, authenticated, service_role/);
});

test("token validation returns the relationship needed for contextual invite copy", () => {
  assert.match(validationMigration, /'relationship_role', ui\.relationship_role/);
  assert.match(validationMigration, /SECURITY DEFINER/);
  assert.match(validationMigration, /WHERE ui\.token_hash = p_token_hash/);
});

test("Academy Solo invitation copy is contextualised without changing the ordinary flow", () => {
  assert.match(invitationPage, /isAcademySoloMetadata/);
  assert.match(invitationPage, /Join Vivacity Academy/);
  assert.match(invitationPage, /Academy learner/);
  assert.match(invitationPage, /Academy Account/);
  assert.match(invitationPage, /RTO Name/);
  assert.match(invitationPage, /getSession\(\)/);
  assert.match(invitationPage, /sessionEmail === invitationData!\.email\.toLowerCase\(\)/);
});
