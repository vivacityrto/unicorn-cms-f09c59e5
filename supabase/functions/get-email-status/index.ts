import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const sendId = url.searchParams.get('sendId');

    if (!sendId) {
      return new Response(
        JSON.stringify({ error: 'sendId parameter is required' }),
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

    // Get email send status
    const { data: emailSend, error: sendError } = await supabase
      .from('email_sends')
      .select('status, created_at, error, mailgun_message_id')
      .eq('id', sendId)
      .single();

    if (sendError) {
      console.error('Error fetching email send:', sendError);
      return new Response(
        JSON.stringify({ error: 'Email send not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Check for delivery events if we have a message ID
    let latestEvent = null;
    if (emailSend.mailgun_message_id) {
      const { data: events } = await supabase
        .from('email_events')
        .select('event, created_at')
        .eq('mailgun_message_id', emailSend.mailgun_message_id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (events && events.length > 0) {
        latestEvent = events[0];
      }
    }

    // Determine overall status
    let overallStatus = emailSend.status;
    if (latestEvent) {
      switch (latestEvent.event) {
        case 'delivered':
          overallStatus = 'delivered';
          break;
        case 'opened':
          overallStatus = 'opened';
          break;
        case 'clicked':
          overallStatus = 'clicked';
          break;
        case 'complained':
        case 'bounced':
        case 'failed':
          overallStatus = 'failed';
          break;
      }
    }

    // Calculate time elapsed
    const createdAt = new Date(emailSend.created_at);
    const now = new Date();
    const secondsElapsed = Math.floor((now.getTime() - createdAt.getTime()) / 1000);

    return new Response(
      JSON.stringify({
        status: overallStatus,
        created_at: emailSend.created_at,
        seconds_elapsed: secondsElapsed,
        latest_event: latestEvent,
        error: emailSend.error,
        message_id: emailSend.mailgun_message_id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in get-email-status function:', error);
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
