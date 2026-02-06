import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationOutbox {
  id: string;
  event_type: string;
  tenant_id: number | null;
  client_id: number | null;
  record_type: string;
  record_id: string;
  recipient_user_uuid: string;
  payload: Record<string, unknown>;
  status: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  next_retry_at: string | null;
}

interface NotificationRule {
  id: string;
  user_uuid: string;
  event_type: string;
  is_enabled: boolean;
  delivery_target: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

interface UserIntegration {
  id: string;
  user_uuid: string;
  provider: string;
  status: string;
  webhook_url: string | null;
  preferred_channel_id: string | null;
  preferred_team_id: string | null;
}

// Format message for Teams
function formatTeamsMessage(notification: NotificationOutbox): Record<string, unknown> {
  const payload = notification.payload as Record<string, unknown>;
  const eventTitles: Record<string, string> = {
    'task_assigned': '📋 Task Assigned',
    'task_overdue': '⚠️ Task Overdue',
    'risk_flagged': '🚨 Risk Flagged',
    'package_threshold_80': '📊 Package Hours at 80%',
    'package_threshold_95': '📊 Package Hours at 95%',
    'package_threshold_100': '🔴 Package Hours at 100%',
    'meeting_action_created': '📝 Meeting Action Created',
  };

  const title = eventTitles[notification.event_type] || 'Unicorn Notification';
  const clientName = payload.client_name || 'Unknown Client';
  const recordTitle = payload.title || payload.name || '';
  
  // Build facts array for the message
  const facts: Array<{ name: string; value: string }> = [];
  
  if (payload.due_date) {
    facts.push({ name: 'Due Date', value: String(payload.due_date) });
  }
  if (payload.assigned_by) {
    facts.push({ name: 'Assigned By', value: String(payload.assigned_by) });
  }
  if (payload.priority) {
    facts.push({ name: 'Priority', value: String(payload.priority) });
  }
  if (payload.hours_used !== undefined && payload.hours_total !== undefined) {
    facts.push({ 
      name: 'Hours', 
      value: `${payload.hours_used} of ${payload.hours_total} used` 
    });
  }

  // Build deep link URL
  const baseUrl = payload.base_url || 'https://unicorn-cms.lovable.app';
  const deepLink = payload.deep_link || `/${notification.record_type}/${notification.record_id}`;
  const fullUrl = `${baseUrl}${deepLink}`;

  // Teams Adaptive Card format
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            size: 'Medium',
            weight: 'Bolder',
            text: title,
          },
          {
            type: 'TextBlock',
            text: `${recordTitle}${clientName ? ` - ${clientName}` : ''}`,
            wrap: true,
          },
          ...(facts.length > 0 ? [{
            type: 'FactSet',
            facts: facts,
          }] : []),
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'Open in Unicorn',
            url: fullUrl,
          },
        ],
      },
    }],
  };
}

// Check if current time is within quiet hours
function isWithinQuietHours(rule: NotificationRule): boolean {
  if (!rule.quiet_hours_start || !rule.quiet_hours_end) {
    return false;
  }

  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  const start = rule.quiet_hours_start;
  const end = rule.quiet_hours_end;

  // Handle overnight quiet hours (e.g., 22:00 to 07:00)
  if (start > end) {
    return currentTime >= start || currentTime <= end;
  }
  
  return currentTime >= start && currentTime <= end;
}

// Calculate next retry time with exponential backoff
function calculateNextRetry(attemptCount: number): Date {
  const baseDelay = 60 * 1000; // 1 minute
  const maxDelay = 24 * 60 * 60 * 1000; // 24 hours
  const delay = Math.min(baseDelay * Math.pow(2, attemptCount), maxDelay);
  return new Date(Date.now() + delay);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get batch size from request or default to 50
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 50;

    console.log(`[NotificationWorker] Processing up to ${batchSize} notifications`);

    // Fetch queued notifications ready for processing
    const { data: notifications, error: fetchError } = await supabaseAdmin
      .from('notification_outbox')
      .select('*')
      .eq('status', 'queued')
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .lt('attempt_count', 5)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      console.error('[NotificationWorker] Error fetching notifications:', fetchError);
      throw fetchError;
    }

    if (!notifications || notifications.length === 0) {
      console.log('[NotificationWorker] No notifications to process');
      return new Response(
        JSON.stringify({ processed: 0, sent: 0, failed: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[NotificationWorker] Found ${notifications.length} notifications to process`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const notification of notifications as NotificationOutbox[]) {
      try {
        // Fetch user's notification rule for this event type
        const { data: rule } = await supabaseAdmin
          .from('notification_rules')
          .select('*')
          .eq('user_uuid', notification.recipient_user_uuid)
          .eq('event_type', notification.event_type)
          .single();

        // Check if notification is disabled
        if (rule && !rule.is_enabled) {
          console.log(`[NotificationWorker] Notification ${notification.id} skipped - disabled by user`);
          await supabaseAdmin
            .from('notification_outbox')
            .update({ status: 'skipped', sent_at: new Date().toISOString() })
            .eq('id', notification.id);
          skipped++;
          continue;
        }

        // Check quiet hours
        if (rule && isWithinQuietHours(rule)) {
          console.log(`[NotificationWorker] Notification ${notification.id} deferred - quiet hours`);
          // Don't mark as skipped, just defer
          await supabaseAdmin
            .from('notification_outbox')
            .update({ next_retry_at: calculateNextRetry(0).toISOString() })
            .eq('id', notification.id);
          continue;
        }

        // Fetch user's Teams integration
        const { data: integration } = await supabaseAdmin
          .from('user_notification_integrations')
          .select('*')
          .eq('user_uuid', notification.recipient_user_uuid)
          .eq('provider', 'microsoft_teams')
          .eq('status', 'connected')
          .single();

        if (!integration || !integration.webhook_url) {
          console.log(`[NotificationWorker] Notification ${notification.id} failed - no Teams integration`);
          await supabaseAdmin
            .from('notification_outbox')
            .update({
              status: 'failed',
              last_error: 'No Teams webhook configured for user',
              attempt_count: notification.attempt_count + 1,
            })
            .eq('id', notification.id);
          failed++;
          continue;
        }

        // Validate user has access to the tenant/client (security check)
        if (notification.tenant_id) {
          const { data: access } = await supabaseAdmin
            .from('tenant_users')
            .select('id')
            .eq('tenant_id', notification.tenant_id)
            .eq('user_uuid', notification.recipient_user_uuid)
            .single();

          if (!access) {
            // Also check if user is a Vivacity team member
            const { data: user } = await supabaseAdmin
              .from('users')
              .select('unicorn_role')
              .eq('user_uuid', notification.recipient_user_uuid)
              .single();

            const isVivacityTeam = user?.unicorn_role && 
              ['Super Admin', 'Team Leader', 'Team Member'].includes(user.unicorn_role);

            if (!isVivacityTeam) {
              console.log(`[NotificationWorker] Notification ${notification.id} blocked - no tenant access`);
              await supabaseAdmin
                .from('notification_outbox')
                .update({
                  status: 'failed',
                  last_error: 'User does not have access to tenant',
                  attempt_count: notification.attempt_count + 1,
                })
                .eq('id', notification.id);
              failed++;
              continue;
            }
          }
        }

        // Format and send the Teams message
        const teamsMessage = formatTeamsMessage(notification);

        const teamsResponse = await fetch(integration.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(teamsMessage),
        });

        if (!teamsResponse.ok) {
          const errorText = await teamsResponse.text();
          throw new Error(`Teams API error: ${teamsResponse.status} - ${errorText}`);
        }

        // Mark as sent
        await supabaseAdmin
          .from('notification_outbox')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            attempt_count: notification.attempt_count + 1,
          })
          .eq('id', notification.id);

        // Log to audit
        await supabaseAdmin
          .from('notification_audit_log')
          .insert({
            notification_id: notification.id,
            action: 'teams_notification_sent',
            recipient_user_uuid: notification.recipient_user_uuid,
            event_type: notification.event_type,
            record_type: notification.record_type,
            record_id: notification.record_id,
            details: { webhook_used: true },
          });

        console.log(`[NotificationWorker] Notification ${notification.id} sent successfully`);
        sent++;

      } catch (error) {
        console.error(`[NotificationWorker] Error processing notification ${notification.id}:`, error);
        
        const newAttemptCount = notification.attempt_count + 1;
        const nextRetry = newAttemptCount < 5 ? calculateNextRetry(newAttemptCount) : null;

        await supabaseAdmin
          .from('notification_outbox')
          .update({
            status: newAttemptCount >= 5 ? 'failed' : 'queued',
            last_error: error instanceof Error ? error.message : 'Unknown error',
            attempt_count: newAttemptCount,
            next_retry_at: nextRetry?.toISOString() || null,
          })
          .eq('id', notification.id);

        // Log failure to audit
        await supabaseAdmin
          .from('notification_audit_log')
          .insert({
            notification_id: notification.id,
            action: 'teams_notification_failed',
            recipient_user_uuid: notification.recipient_user_uuid,
            event_type: notification.event_type,
            record_type: notification.record_type,
            record_id: notification.record_id,
            details: { 
              error: error instanceof Error ? error.message : 'Unknown error',
              attempt: newAttemptCount,
            },
          });

        if (newAttemptCount >= 5) {
          failed++;
        }
      }
    }

    console.log(`[NotificationWorker] Completed - Sent: ${sent}, Failed: ${failed}, Skipped: ${skipped}`);

    return new Response(
      JSON.stringify({
        processed: notifications.length,
        sent,
        failed,
        skipped,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[NotificationWorker] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
