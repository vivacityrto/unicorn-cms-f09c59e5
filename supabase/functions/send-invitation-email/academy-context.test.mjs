import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("Academy Solo invitations use the Academy-specific copy", () => {
  assert.match(source, /template\", \"unicorn_accept_invite_v1\"/);
  assert.match(source, /metadata/);
  assert.match(source, /plan_code === \"academy_solo\"/);
  assert.match(source, /tenantName = \"Vivacity Academy\"/);
  assert.match(source, /\? \"Academy Learner\"/);
  assert.match(source, /has invited you to join <strong[^>]*>Vivacity Academy<\/strong> as an <strong>\$\{roleLabel\}<\/strong>/);
  assert.match(source, /formData\.append\("html", buildAcademyInviteHtml/);
  assert.match(source, /formData\.append\("text", buildAcademyInviteText/);
  assert.doesNotMatch(source, /all-in-one home for your team's compliance documents/);
  assert.match(source, /subject[\s\S]*You've been invited to Vivacity Academy/);
});

test("ordinary invitations retain their existing tenant and role context", () => {
  assert.match(source, /if \(tenantRow\?\.name\) tenantName = tenantRow\.name/);
  assert.match(source, /ROLE_LABELS\[invitation\.unicorn_role\]/);
  assert.match(source, /`You've been invited to \$\{tenantName\} on Unicorn`/);
});
