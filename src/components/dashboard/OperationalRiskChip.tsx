/**
 * OperationalRiskChip – Unicorn 2.0
 *
 * Displays predictive operational risk band as a compact chip.
 * Hover tooltip explains triggered signals.
 * Internal dashboard only — never shown in client portal.
 */

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type PredictiveRiskSnapshot, type RiskBand, getInterventionSuggestion } from '@/hooks/usePredictiveRisk';

interface OperationalRiskChipProps {
  snapshot: PredictiveRiskSnapshot;
  className?: string;
}

const bandConfig: Record<RiskBand, { label: string; className: string }> = {
  stable: {
    label: 'Stable',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  watch: {
    label: 'Watch',
    className: 'bg-brand-aqua/10 text-brand-aqua border-brand-aqua/20',
  },
  at_risk: {
    label: 'At Risk',
    className: 'bg-brand-macaron/10 text-brand-macaron border-brand-macaron/20',
  },
  immediate_attention: {
    label: 'Immediate',
    className: 'bg-brand-fuchsia/10 text-brand-fuchsia border-brand-fuchsia/20',
  },
};

function buildSignalSummary(snapshot: PredictiveRiskSnapshot): string[] {
  const lines: string[] = [];
  if (snapshot.severe_activity_decay) {
    lines.push(`Severe activity drop (${Math.round((1 - (snapshot.inputs.activity_trend_ratio as number ?? 0)) * 100)}% decline)`);
  } else if (snapshot.activity_decay) {
    lines.push(`Activity trending down (ratio: ${snapshot.inputs.activity_trend_ratio})`);
  }
  if (snapshot.risk_escalation) {
    lines.push(`Risk posture worsening (${snapshot.inputs.new_high_risks_7d} new high risks)`);
  }
  if (snapshot.sustained_backlog_growth) {
    lines.push(`Sustained doc backlog (${snapshot.inputs.missing_docs_now} missing)`);
  } else if (snapshot.backlog_growth) {
    lines.push(`Document backlog growing (${snapshot.inputs.missing_docs_now} missing)`);
  }
  if (snapshot.burn_rate_risk) {
    lines.push(`Consult hours: ~${snapshot.inputs.projected_days_to_exhaustion}d to exhaustion`);
  }
  if (snapshot.phase_drift) {
    lines.push(`Stage stagnating (${snapshot.inputs.days_in_current_phase}d, ${snapshot.inputs.actions_remaining} actions left)`);
  }
  if (lines.length === 0) lines.push('No signals detected.');
  return lines;
}

export function OperationalRiskChip({ snapshot, className }: OperationalRiskChipProps) {
  const config = bandConfig[snapshot.risk_band];
  const signals = buildSignalSummary(snapshot);
  const intervention = getInterventionSuggestion(snapshot);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn('text-[10px] px-1.5 py-0 cursor-help', config.className, className)}
        >
          {config.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1.5 text-xs" side="top">
        <p className="font-semibold">Operational Risk: {snapshot.operational_risk_score}/100</p>
        {signals.map((s, i) => (
          <p key={i} className="text-muted-foreground">• {s}</p>
        ))}
        {intervention && (
          <p className="text-primary font-medium mt-1">→ {intervention.label}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
