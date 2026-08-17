import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReportIssueRequest {
  userEmail: string;
  templateSlug: string;
  context?: Record<string, any>;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { userEmail, templateSlug, context = {} }: ReportIssueRequest = await req.json();

    if (!userEmail || !templateSlug) {
      return new Response(
        JSON.stringify({ error: 'userEmail and templateSlug are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    // Add browser/system context
    const enhancedContext = {
      ...context,
      user_agent: req.headers.get('user-agent'),
      timestamp: new Date().toISOString(),
      ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
    };

    const { error } = await supabase
      .from('email_delivery_issues')
      .insert({
        user_email: userEmail,
        template_slug: templateSlug,
        context: enhancedContext,
      });

    if (error) {
      console.error('Error reporting delivery issue:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to report issue' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    console.log('Delivery issue reported:', { userEmail, templateSlug });

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Issue reported successfully. Our team will investigate.'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in report-delivery-issue function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);
