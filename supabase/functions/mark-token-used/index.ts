/**
 * HISTORICAL + H4 — mark-token-used
 *
 * Still ACTIVE on project yxkgdalkbrriasiyyrwk (verify_jwt: true).
 * Vendored from production via get_edge_function on 15 Jul 2026
 * (function id ec086956-6c9f-4596-a522-5fa01a5bfee5, version 68).
 *
 * H4 (14 Jul 2026 Unicorn security audit follow-up):
 * Previously accepted a bare token_id (uuid) with no proof of possession.
 * auth_tokens.id is gen_random_uuid() (not serial), so brute-force guessing
 * is not practical — but a leaked id (logs, network tab, referrer) could
 * still let an anon-JWT caller invalidate someone else's pending token.
 * Callers must now supply the raw opaque token; we re-hash and match before
 * marking used (same proof consume-token already requires).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { corsHeaders } from "../_shared/cors.ts";

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// auth-gate: none -- token-possession endpoint; token hash + token ID and
// conditional unexpired-row claim provide the intended authorization proof.
serve(async (req: Request): Promise<Response> => {
  console.log('Mark token used function called');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { token, token_id } = await req.json();
    console.log('Marking token as used:', token_id ? 'token_id present' : 'missing');
    
    if (!token || !token_id) {
      return new Response(
        JSON.stringify({ error: 'token and token_id are required' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Prove possession of the opaque token (not merely knowledge of the row id).
    const tokenHash = await sha256(token);

    const { data: tokenRow, error: lookupErr } = await supabase
      .from('auth_tokens')
      .select('id, token_hash')
      .eq('id', token_id)
      .maybeSingle();

    if (lookupErr || !tokenRow || tokenRow.token_hash !== tokenHash) {
      return new Response(
        JSON.stringify({ error: 'Token does not match' }),
        { status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const userAgent = req.headers.get('user-agent') || 'unknown';
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    // Conditional claim — only the first unused, unexpired caller wins.
    const { data: claimed, error: updateError } = await supabase
      .from('auth_tokens')
      .update({
        used_at: new Date().toISOString(),
        ip_used: clientIp,
        ua_used: userAgent
      })
      .eq('id', token_id)
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id');

    if (updateError) {
      console.error('Failed to mark token as used:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to mark token as used' }),
        { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }
    if (!claimed || claimed.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Token already used', code: 'TOKEN_CONSUMED' }),
        { status: 410, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token marked as used successfully');

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Mark token used error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
