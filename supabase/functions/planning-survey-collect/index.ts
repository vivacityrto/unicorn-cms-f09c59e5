import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { constantTimeEqual } from '../_shared/requireCaller-helpers.ts';
import { createPlanningSurveyCollector, type CollectionCampaign } from '../_shared/planning-survey-collector.ts';

// Custom capability auth: requireCaller would attach an account to anonymous
// answers. Every operation instead verifies a 256-bit shared campaign key via
// constantTimeEqual() before accepting data. No staff JWT/cookies accepted.
// OFF until hosted logging review, QA and production release are authorised.
const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const enabled = Deno.env.get('PLANNING_SURVEYS_ENABLED') === 'true' && Boolean(url && serviceKey);
const origins = new Set((Deno.env.get('PLANNING_SURVEY_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean));
const client = url && serviceKey ? createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null;
Deno.serve(createPlanningSurveyCollector({
  enabled, allowedOrigins: origins, now: Date.now,
  async findCampaign(id) {
    if (!client) return null;
    const { data, error } = await client.from('eos_planning_campaigns')
      .select('id,business,year,questionnaire_version,state,opens_at,closes_at,key_hash,collection_approved').eq('id', id).maybeSingle();
    if (error || !data || !['vivacity', 'complyhub'].includes(data.business)) return null;
    return {
      id: data.id, business: data.business, year: data.year, questionnaireVersion: data.questionnaire_version,
      state: data.state, opensAtMs: Date.parse(data.opens_at), closesAtMs: Date.parse(data.closes_at),
      keyHash: data.key_hash, collectionApproved: data.collection_approved === true,
    } as CollectionCampaign;
  },
  async verifyKey(key, expectedHash) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    return constantTimeEqual(actual, expectedHash);
  },
  async accept(submission, keyHash) {
    if (!client) return false;
    const { data, error } = await client.rpc('accept_anonymous_planning_response', {
      p_campaign_id: submission.campaignId, p_key_hash: keyHash,
      p_questionnaire_version: submission.questionnaireVersion,
      p_idempotency_key: submission.idempotencyKey, p_answers: submission.answers,
    });
    if (error) throw new Error('Unable to accept response.');
    return data === true;
  },
}));
