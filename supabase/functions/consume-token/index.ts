/**
 * HISTORICAL — consume-token
 *
 * Still ACTIVE on project yxkgdalkbrriasiyyrwk (verify_jwt: true).
 * Vendored from production via get_edge_function on 15 Jul 2026
 * (function id a052c3a1-d965-447f-83a9-2abb2ae55dee, version 89).
 *
 * Validates the opaque HMAC-signed token and returns token metadata
 * (including token_id) without marking used. Companion to issue-token /
 * mark-token-used (H3/H4). No authorization change in this pass —
 * possession of the signed token is the gate.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verify(payload: string, signature: string): Promise<boolean> {
  const secret = Deno.env.get('TOKEN_SIGNING_SECRET');
  if (!secret) {
    throw new Error('TOKEN_SIGNING_SECRET is not configured');
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  
  const signatureBytes = Uint8Array.from(
    atob(signature.replace(/-/g, '+').replace(/_/g, '/'))
      .split('')
      .map(c => c.charCodeAt(0))
  );
  
  return await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(payload)
  );
}

async function parseAndVerifyOpaqueToken(token: string) {
  try {
    const parts = token.split('.');
    
    if (parts.length !== 2) {
      throw new Error('Invalid token format');
    }
    
    const [payloadB64, signatureB64] = parts;
    
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);
    
    const isValid = await verify(payloadB64, signatureB64);
    if (!isValid) {
      throw new Error('Invalid token signature');
    }
    
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token has expired');
    }
    
    return payload;
  } catch (error) {
    console.error('Token verification error:', error);
    throw error;
  }
}

serve(async (req: Request): Promise<Response> => {
  console.log('Consume token function called');
  
  const now = new Date();
  console.log(`[consume-token] UTC time: ${now.toISOString()}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { token, csrf_token } = await req.json();
    console.log('Received token for consumption:', token ? 'present' : 'missing');
    
    const userAgent = req.headers.get('user-agent') || '';
    const scannerPatterns = [
      /Microsoft Office/i,
      /SafeLinks/i,
      /URLProtect/i,
      /Office365/i,
      /Exchange/i,
      /Outlook/i,
      /scanner/i,
      /bot/i,
      /crawler/i
    ];
    
    const isScanner = scannerPatterns.some(pattern => pattern.test(userAgent));
    if (isScanner) {
      console.log('Blocked scanner request:', userAgent);
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (csrf_token) {
      if (typeof csrf_token !== 'string' || csrf_token.length < 32) {
        return new Response(
          JSON.stringify({ error: 'Invalid CSRF token' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tokenHash = await sha256(token);
    console.log('Token hash generated');

    const tokenPayload = await parseAndVerifyOpaqueToken(token);
    console.log('Token payload verified');
    
    const currentTime = new Date();
    console.log(`[consume-token] Checking token expiry against UTC: ${currentTime.toISOString()}`);
    
    const { data: tokenRecord, error: fetchError } = await supabase
      .from('auth_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gte('expires_at', currentTime.toISOString())
      .single();

    if (fetchError || !tokenRecord) {
      console.log('Token not found or already used:', fetchError?.message);
      
      const { data: allTokens } = await supabase
        .from('auth_tokens')
        .select('*')
        .eq('token_hash', tokenHash)
        .order('created_at', { ascending: false })
        .limit(3);
        
      if (allTokens && allTokens.length > 0) {
        allTokens.forEach((t, i) => {
          const expiryDate = new Date(t.expires_at);
          const isExpired = expiryDate < currentTime;
          console.log(`[consume-token] Token ${i + 1}: expires_at=${expiryDate.toISOString()}, used_at=${t.used_at}, expired=${isExpired}`);
        });
      }
      
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token found in database, validating for consumption');
    console.log('Token validated successfully');

    return new Response(
      JSON.stringify({
        user_id: tokenRecord.user_id,
        email: tokenRecord.email,
        type: tokenRecord.token_type,
        meta: tokenRecord.meta,
        token_id: tokenRecord.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Token consumption error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
