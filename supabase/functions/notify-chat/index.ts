import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { event_type, tenant_id, user_id, payload } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user preferences
    const { data: prefs } = await supabaseClient
      .from('user_integration_prefs')
      .select('*')
      .eq('user_id', user_id)
      .eq('tenant_id', tenant_id)
      .single();

    // Get user notification settings (quiet hours check)
    const { data: notifPrefs } = await supabaseClient
      .from('user_notification_prefs')
      .select('*')
      .eq('user_id', user_id)
      .eq('tenant_id', tenant_id)
      .single();

    // Check quiet hours
    if (notifPrefs?.quiet_hours) {
      const now = new Date();
      const quietStart = notifPrefs.quiet_hours.start;
      const quietEnd = notifPrefs.quiet_hours.end;
      const currentTime = now.toTimeString().slice(0, 5);
      
      if (currentTime >= quietStart || currentTime <= quietEnd) {
        console.log('Within quiet hours, skipping notification');
        return new Response(
          JSON.stringify({ message: 'Skipped due to quiet hours' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const messageMap: Record<string, string> = {
      'meeting_reminder_24h': `🔔 Reminder: EOS meeting "${payload.meeting_title}" starts in 24 hours`,
      'meeting_reminder_10m': `⏰ EOS meeting "${payload.meeting_title}" starts in 10 minutes!`,
      'todo_overdue': `📋 To-do overdue: "${payload.todo_title}"`,
      'issue_assigned': `🎯 New issue assigned: "${payload.issue_title}"`,
      'rock_offtrack': `⚠️ Rock off-track: "${payload.rock_title}"`,
      'metric_missing': `📊 Metric entry needed for "${payload.metric_name}" before tomorrow's meeting`,
      'meeting_summary': `✅ Meeting summary available: ${payload.summary_url}`
    };

    const message = messageMap[event_type] || payload.message;

    // Send to Slack if configured
    const { data: slackIntegration } = await supabaseClient
      .from('integration_slack')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('enabled', true)
      .single();

    if (slackIntegration && (prefs?.slack_channel || slackIntegration.default_channel)) {
      const channel = prefs?.slack_channel || slackIntegration.default_channel;
      
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${slackIntegration.oauth_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: prefs?.wants_dm ? user_id : channel,
          text: message,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: message }
            }
          ]
        }),
      });
    }

    // Send to Teams if configured
    const { data: teamsIntegration } = await supabaseClient
      .from('integration_teams')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('enabled', true)
      .single();

    if (teamsIntegration && (prefs?.teams_channel || teamsIntegration.default_channel)) {
      const channel = prefs?.teams_channel || teamsIntegration.default_channel;
      
      await fetch(channel, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          type: 'message'
        }),
      });
    }

    // Queue notification in database for in-app display
    await supabaseClient
      .from('notification_queue')
      .insert({
        tenant_id,
        user_id,
        type: event_type,
        payload,
        channel: 'in-app',
        status: 'delivered',
        delivered_at: new Date().toISOString()
      });

    return new Response(
      JSON.stringify({ success: true, message: 'Notification sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
