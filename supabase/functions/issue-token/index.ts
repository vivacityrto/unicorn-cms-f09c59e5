/**
 * HISTORICAL + H3 — issue-token
 *
 * Still ACTIVE on project yxkgdalkbrriasiyyrwk (verify_jwt: true).
 * Vendored from production via get_edge_function on 15 Jul 2026
 * (function id 6c56b6de-e935-4b98-a77d-95c7bf7680b5, version 90).
 *
 * H3 (14 Jul 2026 Unicorn security audit follow-up):
 * Gateway verify_jwt accepts the public anon key (role=anon JWT), so in-code
 * caller authorization is required. Trusted service-role callers (e.g.
 * invite-or-reset-user) pass via isTrustedInternalCall; external callers must
 * be the token subject (isSelf) or hold admin.team_users.manage / full.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN_SIGNING_SECRET = Deno.env.get('TOKEN_SIGNING_SECRET')!;

export type TokenType = 'magic' | 'verify' | 'reset' | 'setpwd';

const TTL: Record<TokenType, number> = {
  magic: 15 * 60,      // 15 minutes
  verify: 24 * 3600,   // 24 hours  
  reset: 60 * 60,      // 1 hour
  setpwd: 24 * 3600    // 24 hours
};

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(TOKEN_SIGNING_SECRET);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function makeOpaqueToken(payload: Record<string, any>): Promise<string> {
  const json = JSON.stringify(payload);
  const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const sig = await sign(b64);
  return `${b64}.${sig}`;
}

async function assertRateLimit(supabase: any, email: string) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('auth_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', since);

  if ((count || 0) > 5) {
    throw new Error('Too many requests, please try later.');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, type, meta } = await req.json();
    
    const currentTime = new Date();
    console.log(`[issue-token] UTC time: ${currentTime.toISOString()}`);
    
    if (!email || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // H3: distinguish trusted service-role internal calls from external callers.
    // verify_jwt alone is satisfied by the public anon key.
    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '');
    const isTrustedInternalCall = bearer === SERVICE_KEY;

    if (!isTrustedInternalCall) {
      const supabaseAuthClient = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: callerData, error: callerErr } = await supabaseAuthClient.auth.getUser(bearer);
      if (callerErr || !callerData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const isSelf = callerData.user.email?.toLowerCase() === String(email).toLowerCase();
      let isAdmin = false;
      if (!isSelf) {
        const { data: allowed } = await supabaseAuthClient.rpc('check_permission', {
          p_user_id: callerData.user.id,
          p_feature_key: 'admin.team_users.manage',
          p_min_level: 'full',
        });
        isAdmin = !!allowed;
      }
      if (!isSelf && !isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_uuid, first_name, email')
      .eq('email', email)
      .maybeSingle();

    if (userError || !userData) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const user_id = userData.user_uuid;
    
    await assertRateLimit(supabase, email);

    const now = Math.floor(Date.now() / 1000);
    const exp = now + TTL[type as TokenType];
    
    const nowDate = new Date(now * 1000);
    const expDate = new Date(exp * 1000);
    console.log(`[issue-token] Token created at: ${nowDate.toISOString()}`);
    console.log(`[issue-token] Token expires at: ${expDate.toISOString()}`);
    
    const payload = {
      t: type,
      e: email, 
      u: user_id,
      iat: now,
      exp
    };

    const token = await makeOpaqueToken(payload);
    const token_hash = await sha256(token);

    await supabase
      .from('auth_tokens')
      .update({ expires_at: new Date().toISOString() })
      .eq('email', email)
      .eq('token_type', type)
      .is('used_at', null);

    const { error } = await supabase
      .from('auth_tokens')
      .insert({
        user_id,
        email,
        token_type: type,
        token_hash,
        expires_at: new Date(exp * 1000).toISOString(),
        meta: meta || {}
      });

    if (error) {
      console.error('Database error:', error);
      throw new Error(error.message);
    }

    return new Response(JSON.stringify({ 
      token,
      expiresAt: exp,
      firstName: userData.first_name
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in issue-token function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
