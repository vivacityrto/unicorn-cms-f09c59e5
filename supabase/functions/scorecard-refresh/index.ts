// Scorecard Metric Automation Engine
// Deployed as a Supabase Edge Function: scorecard-refresh
// Calculates weekly values for automatic metrics using system data

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const { tenant_id, week_ending, actor_user_id } = body as {
      tenant_id?: number;
      week_ending?: string;
      actor_user_id?: string;
    };

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default to this week's Monday
    const weekEnd = week_ending || getWeekEnding();

    // Fetch all enabled automatic metrics for this tenant
    const { data: metrics, error: metricsError } = await supabase
      .from('eos_scorecard_metrics')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .eq('is_archived', false)
      .in('metric_source', ['automatic', 'hybrid']);

    if (metricsError) throw metricsError;
    if (!metrics || metrics.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: 'No automatic metrics found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: { metric_id: string; status: string; error?: string }[] = [];

    for (const metric of metrics) {
      try {
        const value = await resolveMetricValue(supabase, metric.metric_key, tenant_id, weekEnd);

        if (value === null) {
          results.push({ metric_id: metric.id, status: 'skipped', error: 'No resolver for key: ' + metric.metric_key });
          continue;
        }

        const targetValue = metric.target_value ?? metric.goal_value ?? 0;
        const status = calculateStatus(value, targetValue, metric.direction ?? 'higher_is_better');

        // Check if entry already exists
        const { data: existing } = await supabase
          .from('eos_scorecard_entries')
          .select('id')
          .eq('metric_id', metric.id)
          .eq('week_ending', weekEnd)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('eos_scorecard_entries')
            .update({
              value,
              actual_value: value,
              status,
              entry_source: 'system',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('eos_scorecard_entries').insert({
            metric_id: metric.id,
            tenant_id,
            week_ending: weekEnd,
            value,
            actual_value: value,
            entry_source: 'system',
            status,
            entered_by: actor_user_id || '00000000-0000-0000-0000-000000000000',
            created_by: actor_user_id,
          });
        }

        // Update automation rule last_run
        await supabase
          .from('scorecard_metric_automation_rules')
          .update({ last_run_at: new Date().toISOString(), last_run_status: 'success' })
          .eq('metric_id', metric.id)
          .eq('tenant_id', tenant_id);

        results.push({ metric_id: metric.id, status: 'success' });
      } catch (err) {
        results.push({
          metric_id: metric.id,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Write audit log
    if (actor_user_id) {
      await supabase.from('client_audit_log').insert({
        tenant_id,
        actor_user_id,
        action: 'scorecard.auto_refresh',
        entity_type: 'scorecard',
        entity_id: String(tenant_id),
        details: { week_ending: weekEnd, processed: results.length, results },
      });
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    return new Response(
      JSON.stringify({
        success: true,
        week_ending: weekEnd,
        processed: results.length,
        success_count: successCount,
        error_count: errorCount,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('scorecard-refresh error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function getWeekEnding(): string {
  const now = new Date();
  const day = now.getDay();
  // Get Sunday of the current week as week_ending
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + (7 - day) % 7);
  return sunday.toISOString().split('T')[0];
}

function calculateStatus(actual: number, target: number, direction: string): string {
  const pctOff = Math.abs((actual - target) / (target || 1)) * 100;
  switch (direction) {
    case 'higher_is_better':
      if (actual >= target) return 'green';
      if (pctOff <= 10) return 'amber';
      return 'red';
    case 'lower_is_better':
      if (actual <= target) return 'green';
      if (pctOff <= 10) return 'amber';
      return 'red';
    case 'equals_target':
      if (actual === target) return 'green';
      if (pctOff <= 10) return 'amber';
      return 'red';
    default:
      return 'no_data';
  }
}

// Metric resolution by key — each key maps to a SQL query against system data
async function resolveMetricValue(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  metricKey: string | null,
  tenantId: number,
  weekEnding: string,
): Promise<number | null> {
  if (!metricKey) return null;

  const weekStart = getWeekStart(weekEnding);

  switch (metricKey) {
    case 'overdue_tasks_count': {
      const { count } = await supabase
        .from('client_task_instances')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .lt('due_date', weekEnding)
        .neq('status', 'completed');
      return count ?? 0;
    }

    case 'projects_on_track_pct': {
      const { data: rocks } = await supabase
        .from('eos_rocks')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (!rocks || rocks.length === 0) return null;
      const onTrack = rocks.filter((r: { status: string }) =>
        ['on_track', 'complete'].includes(r.status),
      ).length;
      return Math.round((onTrack / rocks.length) * 100);
    }

    // Placeholder resolvers — these require integration with external data sources
    case 'qualified_leads_count':
    case 'discovery_calls_booked_count':
    case 'proposals_sent_count':
    case 'new_clients_signed_count':
    case 'new_revenue_booked_amount':
    case 'cash_collected_amount':
    case 'website_to_trial_conversion_rate':
    case 'complyhub_free_trials_started_count':
    case 'active_complyhub_users_pct':
    case 'inactive_subscribers_14d_count':
    case 'avg_weekly_actions_per_active_user':
    case 'trial_to_paid_conversion_rate':
    case 'platform_reliability_incidents_count':
    case 'platform_reliability_support_tickets_count':
    case 'reliability_related_subscriber_churn_count':
    case 'clients_with_current_chc_pct':
    case 'clients_overdue_chc_count':
    case 'clients_with_current_validation_pct':
    case 'clients_overdue_validation_count':
    case 'successful_initial_registrations_count':
    case 'successful_reregistrations_count':
      // TODO: Wire to external data sources (ComplyHub API, CRM, etc.)
      return null;

    default:
      return null;
  }
}

function getWeekStart(weekEnding: string): string {
  const d = new Date(weekEnding);
  d.setDate(d.getDate() - 6);
  return d.toISOString().split('T')[0];
}
