/**
 * AlignmentSignalsPanel – Unicorn 2.0
 *
 * Surfaces items requiring Visionary–Integrator discussion.
 * This is the Level 10 prep tool.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MessageSquare } from 'lucide-react';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';
import type { AnomalyRow } from '@/hooks/useExecutiveAnomalies';

interface AlignmentSignalsPanelProps {
  data: ExecutiveHealthRow[];
  anomalies: AnomalyRow[];
}

interface AlignmentSignal {
  client: string;
  owner: string | null;
  what: string;
  severity: 'critical' | 'warning' | 'info';
  suggestion: string;
}

export function AlignmentSignalsPanel({ data, anomalies }: AlignmentSignalsPanelProps) {
  const signals = useMemo(() => {
    const result: AlignmentSignal[] = [];

    // Clients moved into At Risk (7d)
    data.filter(r => (r.risk_band === 'at_risk' || r.risk_band === 'immediate_attention') && r.risk_band_change_7d === 'changed')
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: `Moved to ${r.risk_band.replace('_', ' ')}`,
          severity: r.risk_band === 'immediate_attention' ? 'critical' : 'warning',
          suggestion: 'Discuss escalation path and next steps',
        });
      });

    // Compliance drops >10 (7d)
    data.filter(r => r.delta_overall_score_7d <= -10)
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: `Compliance score dropped ${Math.abs(r.delta_overall_score_7d)} points`,
          severity: r.delta_overall_score_7d <= -15 ? 'critical' : 'warning',
          suggestion: 'Review compliance breakdown and blockers',
        });
      });

    // New critical risks
    data.filter(r => r.has_active_critical)
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: 'Active critical risk',
          severity: 'critical',
          suggestion: 'Review risk register and assign resolution owner',
        });
      });

    // Predictive spikes >20
    data.filter(r => r.delta_operational_risk_7d >= 20)
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: `Operational risk spiked +${r.delta_operational_risk_7d}`,
          severity: 'critical',
          suggestion: 'Assess root cause and coaching needs',
        });
      });

    // <10 consult hours remaining
    data.filter(r => r.hours_remaining < 10 && r.hours_included > 0)
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: `${r.hours_remaining}h consult hours remaining`,
          severity: r.hours_remaining <= 3 ? 'critical' : 'warning',
          suggestion: 'Discuss reallocation or package extension',
        });
      });

    // Deduplicate by client+what
    const seen = new Set<string>();
    return result.filter(s => {
      const key = `${s.client}|${s.what}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
    });
  }, [data, anomalies]);

  const severityStyles: Record<string, string> = {
    critical: 'bg-brand-fuchsia-100 text-brand-fuchsia-700 dark:bg-brand-fuchsia-900 dark:text-brand-fuchsia-200',
    warning: 'bg-brand-macaron-100 text-brand-macaron-700 dark:bg-brand-macaron-900 dark:text-brand-macaron-200',
    info: 'bg-brand-purple-100 text-brand-purple-700 dark:bg-brand-purple-900 dark:text-brand-purple-200',
  };

  if (signals.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Alignment Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No items requiring discussion this week.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Alignment Signals
        </CardTitle>
        <p className="text-xs text-muted-foreground">{signals.length} items for discussion</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">What Changed</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Suggested Discussion</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-foreground max-w-[160px] truncate">{s.client}</td>
                  <td className="px-4 py-2.5 text-foreground">{s.what}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{s.suggestion}</td>
                  <td className="px-3 py-2.5 text-center">
                    <Badge className={cn('text-[10px] capitalize', severityStyles[s.severity])}>
                      {s.severity}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
