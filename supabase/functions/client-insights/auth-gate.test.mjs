/**
 * Source-level checks for client-insights.
 *
 * This function is called by client-portal users and spends money on an AI service, so what matters is that: only
 * an active client user (or staff previewing) in an organisation that has client AI switched on can reach the AI,
 * the organisation can never come from the request, every read uses the caller's own row-level-security client,
 * the only caller input is a validated surface, nothing is written to the tenant's data, no names are sent to the
 * model, and the model's numbers are checked against the facts before anything is returned.
 *
 * Run: node --test supabase/functions/client-insights/auth-gate.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "index.ts"), "utf8");
const shared = readFileSync(join(here, "..", "_shared", "client-insights.ts"), "utf8");
const limits = readFileSync(join(here, "..", "_shared", "client-ai-limits.ts"), "utf8");
const config = readFileSync(join(here, "..", "..", "config.toml"), "utf8");

const before = (earlier, later) => {
  const a = src.indexOf(earlier);
  const b = src.indexOf(later);
  assert.ok(a > 0 && b > 0, `${earlier} and ${later} must both be present`);
  assert.ok(a < b, `${earlier} must come before ${later}`);
};

describe("client-insights", () => {
  it("authenticates, gates by role and organisation, checks the rollout flag and budget, in that order, before any read or AI call", () => {
    assert.match(src, /import \{[^}]*verifyAuth[^}]*\} from "\.\.\/_shared\/auth-helpers\.ts"/);
    assert.match(src, /validateClientAskVivAccess\(/);
    before("await verifyAuth(", "await req.json()");
    before("await req.json()", "await validateClientAskVivAccess(");
    before("await validateClientAskVivAccess(", "await isClientAiEnabledForTenant(");
    before("await isClientAiEnabledForTenant(", "await checkClientTokenBudget(");
    before("await checkClientTokenBudget(", 'supabase.rpc("get_client_package_dashboard"');
    before("await checkClientTokenBudget(", "await callAnthropic(");
    assert.match(src, /if \(!access\.allowed\) return askVivAccessDeniedResponse/);
  });

  it("takes the organisation from the access gate and refuses any scope in the request body", () => {
    assert.match(src, /const tenantId = access\.tenant_id;/);
    assert.match(src, /for \(const forbidden of FORBIDDEN_BODY_FIELDS\)/);
    for (const f of ["tenant_id", "client_id", "package_id", "user_id"]) assert.match(shared, new RegExp(`"${f}"`));
    assert.doesNotMatch(src, /body\.tenant_id|payload\.tenant_id/);
    // Every filter that names an organisation uses the gate's value.
    assert.doesNotMatch(src, /\.eq\("tenant_id", (?!tenantId\))/);
  });

  it("only accepts a surface from a fixed list and lets only Vivacity staff pass a preview organisation", () => {
    assert.match(src, /isSurface\(body\.surface\)/);
    assert.match(shared, /SURFACES = \["home", "packages", "academy"\]/);
    assert.match(src, /if \(!isVivacityInternal\(profile\)\) return jsonError\(req, 400/);
    assert.equal((src.match(/req\.json\(\)/g) ?? []).length, 1);
  });

  it("reads tenant data only as the caller, and uses service role only for settings and usage", () => {
    const serviceUses = src.match(/serviceClient/g) ?? [];
    // created once, then passed to the flag, budget and usage helpers only
    assert.ok(serviceUses.length >= 4);
    assert.doesNotMatch(src, /serviceClient\s*\.\s*(from|rpc)\(/);
    assert.match(src, /supabase\.rpc\("get_client_package_dashboard"/);
    assert.match(src, /supabase\.from\("v_client_home_feed"\)/);
    assert.match(src, /supabase\.rpc\("get_tenant_academy_learner_analytics"/);
  });

  it("writes nothing to tenant data and makes no outbound call of its own", () => {
    assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/);
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.equal((src.match(/await callAnthropic\(/g) ?? []).length, 1);
    assert.match(src, /tool_choice: \{ type: "tool", name: SUMMARY_TOOL\.name \}/);
    // The only writes are token counts, in the shared limits module, to the usage table.
    assert.match(limits, /ask_viv_client_assistant_usage/);
  });

  it("sends no names or email addresses to the model", () => {
    assert.doesNotMatch(src, /select\("[^"]*\b(email|first_name|last_name|full_name)\b/);
    assert.doesNotMatch(shared, /\b(email|first_name|last_name|full_name)\b/i);
    assert.match(src, /packageSection\(/);
  });

  it("checks the model's numbers against the facts and drops a summary that does not match", () => {
    assert.match(src, /isGrounded\(summary, factsText\(surface, sections\)\)/);
    assert.match(src, /"UNGROUNDED"/);
    assert.match(src, /parseSummary\(/);
    assert.doesNotMatch(src, /error: String\(error\)|error\.message \}/);
  });

  it("uses the cheap model, bounds the call, and sends no temperature", () => {
    assert.match(src, /CLAUDE_HAIKU_MODEL/);
    assert.match(src, /AbortController/);
    assert.match(src, /AI_TIMEOUT_MS/);
    assert.match(src, /max_tokens: 600/);
    assert.doesNotMatch(src, /^\s*temperature\s*:/m);
  });

  it("records token use so the daily budget is shared with the client chat", () => {
    assert.match(src, /await recordClientTokens\(serviceClient, user\.id/);
  });

  it("is registered in config.toml with in-function auth", () => {
    assert.match(config, /\[functions\.client-insights\]\s*\r?\nverify_jwt = false/);
  });
});
