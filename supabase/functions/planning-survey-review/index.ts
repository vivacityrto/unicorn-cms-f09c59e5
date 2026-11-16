import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { requireCaller } from '../_shared/requireCaller.ts';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req => {
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  const reply = (status: number, value: object) => new Response(JSON.stringify(value), { status, headers });
  if (Deno.env.get('PLANNING_SURVEY_REVIEW_ENABLED') !== 'true') return reply(503, { error: 'Review unavailable.' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST' || new URL(req.url).search) return reply(400, { error: 'Request not accepted.' });
  try {
    const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply(503, { error: 'Review unavailable.' });
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const caller = await requireCaller(req, client, { featureKey: 'eos.configurations.manage', minLevel: 'full', headers });
    if (!caller.ok) return caller.response;
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { error: 'Request not accepted.' });
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) {
      const {value,done} = await reader.read(); if (done) break;
      size += value.length; if (size > 1000) { await reader.cancel(); throw new Error('Invalid'); }
      chunks.push(value);
    } } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2
      || !Object.keys(body).every(k => ['campaignId','action'].includes(k))
      || typeof body.campaignId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.campaignId)
      || !['review','close'].includes(body.action)) return reply(400, { error: 'Request not accepted.' });
    const { data, error } = await client.rpc('review_anonymous_planning_campaign', {
      p_campaign_id: body.campaignId, p_actor_user_id: caller.user.id, p_action: body.action,
    });
    if (error || !data) return reply(403, { error: 'Review unavailable.' });
    return reply(200, data);
  } catch { return reply(400, { error: 'Request not accepted.' }); } // Never log answers or request/DB details.
});
