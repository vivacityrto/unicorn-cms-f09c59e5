/**
 * Regression checks for staff-onboarding-workbook caller authorization.
 *
 * Ensures the edge function gates on the same check_permission RPC the
 * internal-onboarding storage RLS uses (admin.team_users.manage / full),
 * before any of upload / signed-url / remove.
 *
 * Run: node --test supabase/functions/staff-onboarding-workbook/auth-gate.test.mjs
 *
 * Manual live check (non-admin internal staff JWT must get 403 FORBIDDEN
 * on all three actions — not 200 / PATH_NOT_ALLOWED / RUN_NOT_FOUND):
 *
 *   PROJECT_URL=https://<ref>.supabase.co
 *   ANON_KEY=<anon>
 *   STAFF_JWT=<jwt of is_vivacity_internal user without admin.team_users.manage>
 *   RUN_ID=<any positive integer>
 *
 *   for action in upload signed-url remove; do
 *     echo "=== $action ==="
 *     if [ "$action" = upload ]; then
 *       curl -sS -o /tmp/wb-body -w "%{http_code}" \
 *         -X POST "$PROJECT_URL/functions/v1/staff-onboarding-workbook" \
 *         -H "Authorization: Bearer $STAFF_JWT" \
 *         -H "apikey: $ANON_KEY" \
 *         -F "action=upload" -F "runId=$RUN_ID" \
 *         -F "file=@/dev/null;filename=x.pdf;type=application/pdf"
 *     else
 *       curl -sS -o /tmp/wb-body -w "%{http_code}" \
 *         -X POST "$PROJECT_URL/functions/v1/staff-onboarding-workbook" \
 *         -H "Authorization: Bearer $STAFF_JWT" \
 *         -H "apikey: $ANON_KEY" \
 *         -H "Content-Type: application/json" \
 *         -d "{\"action\":\"$action\",\"runId\":$RUN_ID,\"path\":\"workbooks/run-$RUN_ID-0.pdf\"}"
 *     fi
 *     echo
 *     cat /tmp/wb-body; echo
 *     # Expect HTTP 403 and body: {"ok":false,"code":"FORBIDDEN","detail":"HR/Admin only"}
 *   done
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

describe("staff-onboarding-workbook authorization gate", () => {
  it("calls check_permission with admin.team_users.manage / full (matches storage RLS)", () => {
    assert.match(src, /rpc\(\s*["']check_permission["']/);
    assert.match(src, /p_feature_key:\s*["']admin\.team_users\.manage["']/);
    assert.match(src, /p_min_level:\s*["']full["']/);
    assert.match(
      src,
      /jsonErr\(\s*403,\s*["']FORBIDDEN["'],\s*["']HR\/Admin only["']\s*\)/,
    );
  });

  it("does not gate on the former profile-flag staff check", () => {
    assert.doesNotMatch(src, /select\(\s*["']is_vivacity_internal["']\s*\)/);
    assert.doesNotMatch(src, /\.from\(\s*["']users["']\s*\)/);
    assert.doesNotMatch(src, /Vivacity staff only/);
  });

  it("applies the permission check before upload / signed-url / remove", () => {
    const permIdx = src.indexOf("check_permission");
    const uploadIdx = src.indexOf('action === "upload"');
    const signedIdx = src.indexOf('action === "signed-url"');
    const removeIdx = src.indexOf('action === "remove"');

    assert.ok(permIdx >= 0, "check_permission call present");
    assert.ok(uploadIdx >= 0 && signedIdx >= 0 && removeIdx >= 0, "all three actions present");
    assert.ok(permIdx < uploadIdx, "gate before upload");
    assert.ok(permIdx < signedIdx, "gate before signed-url");
    assert.ok(permIdx < removeIdx, "gate before remove");
  });
});
