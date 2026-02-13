import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignalInputRow {
  tenant_id: number;
  package_instance_id: number;
  package_id: number;
  client_name: string;
  package_name: string;
  activity_trend_ratio: number;
  total_activity_7d: number;
  total_activity_30d: number;
  new_high_risks_7d: number;
  overdue_high_risks: number;
  missing_docs_now: number;
  hours_used_30d: number;
  remaining_hours: number;
  projected_days_to_exhaustion: number;
  days_in_current_phase: number;
  actions_remaining: number;
}

function computeSignals(row: SignalInputRow) {
  // A. Activity Decay
  const activityDecay = row.activity_trend_ratio < 0.5;
  const severeActivityDecay = row.activity_trend_ratio < 0.25;

  // B. Risk Escalation: risk_volatility = (new_high * 3) + (overdue_high * 2)
  const riskVolatility = (row.new_high_risks_7d * 3) + (row.overdue_high_risks * 2);
  const riskEscalation = riskVolatility >= 4;

  // C. Backlog Growth (simplified: flag if missing > 3 docs)
  const backlogGrowth = row.missing_docs_now > 3;
  const sustainedBacklogGrowth = row.missing_docs_now > 5;

  // D. Burn Rate Risk
  const burnRateRisk = row.projected_days_to_exhaustion < 21 && row.remaining_hours > 0;

  // E. Phase Stagnation Drift
  const phaseDrift = row.days_in_current_phase >= 7
    && row.actions_remaining > 5
    && row.activity_trend_ratio < 0.5;

  // Score: weighted flags
  let score = 0;
  if (activityDecay) score += 25;
  if (riskEscalation) score += 25;
  if (backlogGrowth) score += 20;
  if (burnRateRisk) score += 15;
  if (phaseDrift) score += 15;
  score = Math.min(score, 100);

  let riskBand: string;
  if (score >= 75) riskBand = 'immediate_attention';
  else if (score >= 50) riskBand = 'at_risk';
  else if (score >= 25) riskBand = 'watch';
  else riskBand = 'stable';

  return {
    activity_decay: activityDecay,
    severe_activity_decay: severeActivityDecay,
    risk_escalation: riskEscalation,
    backlog_growth: backlogGrowth,
    sustained_backlog_growth: sustainedBacklogGrowth,
    burn_rate_risk: burnRateRisk,
    phase_drift: phaseDrift,
    operational_risk_score: score,
    risk_band: riskBand,
    inputs: {
      activity_trend_ratio: row.activity_trend_ratio,
      total_activity_7d: row.total_activity_7d,
      total_activity_30d: row.total_activity_30d,
      risk_volatility: riskVolatility,
      new_high_risks_7d: row.new_high_risks_7d,
      overdue_high_risks: row.overdue_high_risks,
      missing_docs_now: row.missing_docs_now,
      hours_used_30d: row.hours_used_30d,
      remaining_hours: row.remaining_hours,
      projected_days_to_exhaustion: row.projected_days_to_exhaustion,
      days_in_current_phase: row.days_in_current_phase,
      actions_remaining: row.actions_remaining,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all signal inputs
    const { data: signals, error: fetchError } = await supabase
      .from('v_predictive_signal_inputs')
      .select('*');

    if (fetchError) throw fetchError;
    if (!signals || signals.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Compute and batch insert snapshots
    const snapshots = signals.map((row: SignalInputRow) => {
      const result = computeSignals(row);
      return {
        tenant_id: row.tenant_id,
        package_instance_id: row.package_instance_id,
        ...result,
      };
    });

    // Insert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('predictive_operational_risk_snapshots')
        .insert(batch);
      if (insertError) {
        console.error(`[PredictiveRisk] Batch insert error at ${i}:`, insertError);
      }
    }

    // Log to audit
    await supabase.from('audit_events').insert({
      entity: 'predictive_risk',
      entity_id: crypto.randomUUID(),
      action: 'nightly_calculation',
      user_id: null,
      details: {
        total_packages: signals.length,
        risk_bands: {
          stable: snapshots.filter((s: any) => s.risk_band === 'stable').length,
          watch: snapshots.filter((s: any) => s.risk_band === 'watch').length,
          at_risk: snapshots.filter((s: any) => s.risk_band === 'at_risk').length,
          immediate_attention: snapshots.filter((s: any) => s.risk_band === 'immediate_attention').length,
        },
      },
    });

    return new Response(JSON.stringify({ processed: snapshots.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[PredictiveRisk] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
