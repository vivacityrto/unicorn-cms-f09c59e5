import test from "node:test";
import assert from "node:assert/strict";
import {
  QA_PROJECT_REF,
  QA_PROJECT_URL,
  authStorageKey,
  isRlsDenied,
  readAuthSession,
  validateQaConfig,
} from "./qa-rock-notes-crud.mjs";

const qaEnv = {
  QA_SUPABASE_PROJECT_REF: QA_PROJECT_REF,
  VITE_SUPABASE_URL: QA_PROJECT_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: "qa-publishable-test-value",
  QA_ROCK_NOTES_TEST_RUN_ID: "41820657263-1",
};

test("accepts only the allowlisted QA URL, ref, public key, and run id", () => {
  assert.deepEqual(validateQaConfig(qaEnv), {
    url: QA_PROJECT_URL,
    publishableKey: qaEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
    runId: qaEnv.QA_ROCK_NOTES_TEST_RUN_ID,
  });
  assert.throws(() => validateQaConfig({ ...qaEnv, QA_SUPABASE_PROJECT_REF: "yxkgdalkbrriasiyyrwk" }), /expected project ref/);
  assert.throws(() => validateQaConfig({ ...qaEnv, VITE_SUPABASE_URL: "https://yxkgdalkbrriasiyyrwk.supabase.co" }), /expected URL/);
  assert.throws(() => validateQaConfig({ ...qaEnv, VITE_SUPABASE_PUBLISHABLE_KEY: "" }), /publishable key is missing/);
  assert.throws(() => validateQaConfig({ ...qaEnv, QA_ROCK_NOTES_TEST_RUN_ID: "latest" }), /run id must be/);
});

test("extracts only the session for the verified QA project from a real-login state", () => {
  const session = { access_token: "access-token-test-only", refresh_token: "refresh-token-test-only" };
  const storageState = {
    origins: [{
      origin: "http://localhost:8080",
      localStorage: [{ name: authStorageKey(), value: JSON.stringify(session) }],
    }],
  };
  assert.deepEqual(readAuthSession(storageState, "author"), session);
  assert.throws(() => readAuthSession(storageState, "author", "yxkgdalkbrriasiyyrwk"), /No QA auth session/);
  assert.throws(() => readAuthSession({ origins: [] }, "author"), /No QA auth session/);
  assert.throws(() => readAuthSession({ origins: [{ origin: "http://localhost:8080", localStorage: [{ name: authStorageKey(), value: "not-json" }] }] }, "author"), /Invalid QA auth session data/);
});

test("treats an RLS-hidden mutation as a denied zero-row result, not a successful write", () => {
  assert.equal(isRlsDenied({ data: [], error: null }), true);
  assert.equal(isRlsDenied({ data: [{ id: "unexpected" }], error: null }), false);
  assert.equal(isRlsDenied({ data: [], error: { code: "42501" } }), false);
  assert.equal(isRlsDenied({ data: null, error: null }), false);
});
