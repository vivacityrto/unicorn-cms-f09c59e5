import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("QA no-send mode is explicit and fail-closed", () => {
  assert.match(source, /SUPABASE_URL === QA_PROJECT_URL/);
  assert.match(source, /const suppressQaDelivery = SUPABASE_URL === QA_PROJECT_URL/);
  assert.match(source, /if \(suppressQaDelivery\)/);
  assert.match(source, /supabase\.functions\.invoke\(['"]send-invitation-email['"]/, 
  );
});

test("delivery suppression follows pending invitation insertion", () => {
  const insertIndex = source.indexOf(".from('user_invitations')");
  const emailIndex = source.indexOf("supabase.functions.invoke('send-invitation-email'");

  assert.ok(insertIndex >= 0, "pending invitation insert must remain present");
  const suppressionIndex = source.indexOf("suppressQaDelivery");
  assert.ok(suppressionIndex > insertIndex, "delivery suppression must be evaluated after the pending row path");
  assert.ok(emailIndex > suppressionIndex, "email dispatch must remain downstream of delivery suppression");
});

test("QA no-send does not reuse skip_email's direct-membership path", () => {
  const skipEmailIndex = source.indexOf("if (payload.skip_email)");
  const standardPathIndex = source.indexOf("// --- STANDARD INVITATION PATH ---");

  assert.ok(skipEmailIndex >= 0, "legacy direct-membership path remains explicit");
  assert.ok(standardPathIndex > skipEmailIndex, "standard invitation path remains separate");
  assert.ok(source.indexOf("suppressQaDelivery") > standardPathIndex, "QA suppression belongs to the standard invitation path");
});
