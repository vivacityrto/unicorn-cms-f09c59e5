/**
 * Regression: invite-to-tenant must reject any unicorn_role outside
 * CLIENT_ROLES (Admin/User), regardless of which authorization path
 * (admin.invites.manage or has_tenant_admin_safe) granted access, and
 * must build CORS headers per-request rather than reusing the imported
 * cors.ts function as a static header object.
 *
 * Before this fix: a caller authorized only via has_tenant_admin_safe
 * for their own tenant could still submit `role: "Super Admin"` (or any
 * other value) with no server-side rejection — a privilege-escalation
 * path once the invitation was accepted. Separately, `corsHeaders` (a
 * function) was spread/used directly as a headers object rather than
 * called with `(req)`, producing broken CORS on every response.
 *
 * Run: node --test supabase/functions/invite-to-tenant/role-allowlist.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "index.ts"),
  "utf8",
);

describe("invite-to-tenant role allowlist and CORS", () => {
  it("defines a CLIENT_ROLES allowlist restricted to Admin/User", () => {
    assert.match(src, /const CLIENT_ROLES = \["Admin", "User"\]/);
  });

  it("rejects a role outside CLIENT_ROLES before the authorization check", () => {
    const roleCheckIdx = src.indexOf("CLIENT_ROLES.includes(role)");
    const authCheckIdx = src.indexOf('p_feature_key: "admin.invites.manage"');
    assert.ok(roleCheckIdx >= 0, "role allowlist check present");
    assert.ok(
      roleCheckIdx < authCheckIdx,
      "role is validated independent of (before) which authorization path is used",
    );
    assert.match(src, /ROLE_NOT_ALLOWED/);
  });

  it("builds CORS headers by calling corsHeaders(req), not using it as a static object", () => {
    assert.match(src, /import \{ corsHeaders as buildCorsHeaders \} from "\.\.\/_shared\/cors\.ts"/);
    assert.match(src, /const corsHeaders = buildCorsHeaders\(req\)/);
  });

  it("does not log the plaintext invite link/token", () => {
    assert.doesNotMatch(src, /console\.log\(["']Generated invite link:["'],\s*inviteLink\)/);
    assert.doesNotMatch(src, /console\.\w+\([^)]*inviteLink[^)]*\)/);
  });
});
