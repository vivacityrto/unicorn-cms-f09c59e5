import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, email } = await req.json();
    console.log('Creating session v2 for user:', { user_id, email });

    if (!user_id || !email) {
      return new Response(JSON.stringify({ error: 'User ID and email are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) { console.error('List users error:', listError); throw listError; }

    let authUser = authUsers?.users?.find(u => u.email === email);

    if (!authUser) {
      console.log('Creating new auth user for:', email);
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email, email_confirm: true, user_metadata: { user_id }
      });
      if (createError) { console.error('Create user error:', createError); throw createError; }
      authUser = newUser.user;
    }

    if (!authUser) { throw new Error('Failed to get or create auth user'); }

    const { data: otpData, error: otpError } = await supabase.auth.admin.generateLink({
      type: 'magiclink', email: email, options: { redirectTo: 'https://unicorn-cms.au/auth/magic' }
    });
    if (otpError) { console.error('OTP generation error:', otpError); throw otpError; }

    const url = new URL(otpData.properties?.action_link || '');
    const accessToken = url.searchParams.get('access_token');
    const refreshToken = url.searchParams.get('refresh_token');

    if (!accessToken) {
      return new Response(JSON.stringify({
        user: authUser, success: true, requiresClientAuth: true, email: authUser.email
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      access_token: accessToken, refresh_token: refreshToken, user: authUser, success: true
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Error in create-session-v2 function:', error);
    return new Response(JSON.stringify({ error: error.message, details: error.toString() }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
