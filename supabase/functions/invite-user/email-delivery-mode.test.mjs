import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("QA no-send mode is explicit and fail-closed", () => {
  assert.match(source, /Deno\.env\.get\(['"]INVITATION_EMAIL_MODE['"]\) \?\? ['"]send['"]/);
  assert.match(
    source,
    /invitationEmailMode === ['"]qa-no-send['"] && Deno\.env\.get\(['"]SUPABASE_ENVIRONMENT['"]\) === ['"]qa['"]/, 
  );
  assert.match(source, /if \(suppressQaDelivery\)/);
  assert.match(source, /supabase\.functions\.invoke\(['"]send-invitation-email['"]/, 
  );
});

test("delivery suppression follows pending invitation insertion", () => {
  const insertIndex = source.indexOf(".from('user_invitations')");
  const modeIndex = source.indexOf("INVITATION_EMAIL_MODE");
  const emailIndex = source.indexOf("supabase.functions.invoke('send-invitation-email'");

  assert.ok(insertIndex >= 0, "pending invitation insert must remain present");
  assert.ok(modeIndex > insertIndex, "delivery mode must be evaluated after the pending row path");
  assert.ok(emailIndex > modeIndex, "email dispatch must remain downstream of delivery mode");
});

test("QA no-send does not reuse skip_email's direct-membership path", () => {
  const skipEmailIndex = source.indexOf("if (payload.skip_email)");
  const standardPathIndex = source.indexOf("// --- STANDARD INVITATION PATH ---");
  const modeIndex = source.indexOf("INVITATION_EMAIL_MODE");

  assert.ok(skipEmailIndex >= 0, "legacy direct-membership path remains explicit");
  assert.ok(standardPathIndex > skipEmailIndex, "standard invitation path remains separate");
  assert.ok(modeIndex > standardPathIndex, "QA suppression belongs to the standard invitation path");
});
