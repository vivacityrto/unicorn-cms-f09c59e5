import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

// Every request must pass token extraction, verifyAuth, validateAskVivAccess,
// and the isAssistantEnabledForUser rollout-flag check, in that order, before
// any tool call or DB write.
assert.match(source, /const token = extractToken\(req\)/);
assert.match(source, /verifyAuth\(supabase, token\)/);
assert.match(source, /validateAskVivAccess\(supabase, user\.id, profile, "ask-viv-assistant"\)/);
assert.match(source, /isAssistantEnabledForUser\(supabase, user\.id, profile\)/);

const optionsIndex = source.indexOf('req.method === "OPTIONS"');
const tokenIndex = source.indexOf('const token = extractToken(req)');
const verifyIndex = source.indexOf('verifyAuth(supabase, token)');
const accessIndex = source.indexOf('validateAskVivAccess(supabase, user.id, profile, "ask-viv-assistant")');
const enabledIndex = source.indexOf('isAssistantEnabledForUser(supabase, user.id, profile)');
const usageCapIndex = source.indexOf('checkUsageCap(supabase, user.id)');

assert.ok(optionsIndex > -1, 'must handle CORS preflight OPTIONS requests');
assert.ok(tokenIndex > -1 && verifyIndex > -1 && accessIndex > -1 && enabledIndex > -1 && usageCapIndex > -1);
assert.ok(optionsIndex < tokenIndex, 'OPTIONS handling must run before token extraction');
assert.ok(tokenIndex < verifyIndex, 'token extraction must run before verifyAuth');
assert.ok(verifyIndex < accessIndex, 'verifyAuth must run before validateAskVivAccess');
assert.ok(accessIndex < enabledIndex, 'validateAskVivAccess must run before the rollout-flag check');
assert.ok(enabledIndex < usageCapIndex, 'the rollout-flag check must run before the usage-cap check');

// Phase 2.6 P5-A: all 76 no-explicit-any findings were retired by casting
// each tool's query result to a row shape modelling only the columns that
// tool selects, rather than leaving Supabase client / query-result
// parameters typed `any`. Assert the client itself is properly typed and no
// `any` regression crept back in.
assert.match(source, /supabase: SupabaseClient/);
assert.match(source, /interface TenantSearchRow/);
assert.match(source, /interface AskVivCorpusMatchRow/);
assert.match(source, /interface EosMeetingSummaryDetailRow/);
assert.ok(!/:\s*any\b/.test(source), 'must not reintroduce an explicit any type annotation');
assert.ok(!/as any\b/.test(source), 'must not reintroduce an any cast');

// Every named tool must still be dispatched inside executeTool.
const TOOL_NAMES = [
  'search_clients', 'get_client_context', 'search_notes_and_emails', 'search_eos',
  'search_documents', 'list_clients_for_staff', 'search_standards', 'get_portfolio_attention',
  'rank_clients_by_activity', 'list_new_clients', 'list_deadlines_and_overdue_work',
  'find_findings_without_remediation', 'compare_clients', 'get_stage_health_hotspots',
  'get_consultant_workload_comparison', 'get_activity_trend', 'search_notes_across_clients',
  'get_academy_adoption', 'list_document_templates', 'list_eos_meetings', 'get_eos_meeting_details',
];
for (const tool of TOOL_NAMES) {
  assert.match(source, new RegExp(`if \\(name === "${tool}"\\)`), `executeTool must still handle ${tool}`);
}

console.log('ask-viv-assistant auth-gate and typing checks passed');
