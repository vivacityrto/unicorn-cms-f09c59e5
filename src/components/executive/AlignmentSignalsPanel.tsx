/**
 * AlignmentSignalsPanel – Unicorn 2.0
 *
 * "Where We Must Talk" — core meeting surface.
 * Sources from health data, anomalies, and stalled packages.
 * Capped at 8 highest-priority items.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';
import type { AnomalyRow } from '@/hooks/useExecutiveAnomalies';

interface AlignmentSignalsPanelProps {
  data: ExecutiveHealthRow[];
  anomalies: AnomalyRow[];
}

interface AlignmentSignal {
  client: string;
  what: string;
  owner: string | null;
  severity: 'critical' | 'warning' | 'info';
}

const severityStyles: Record<string, string> = {
  critical: 'bg-brand-fuchsia-100 text-brand-fuchsia-700 dark:bg-brand-fuchsia-900 dark:text-brand-fuchsia-200',
  warning: 'bg-brand-macaron-100 text-brand-macaron-700 dark:bg-brand-macaron-900 dark:text-brand-macaron-200',
  info: 'bg-brand-purple-100 text-brand-purple-700 dark:bg-brand-purple-900 dark:text-brand-purple-200',
};

export function AlignmentSignalsPanel({ data, anomalies }: AlignmentSignalsPanelProps) {
  const signals = useMemo(() => {
    const result: AlignmentSignal[] = [];

    // Band worsened (7d)
    data.filter(r => (r.risk_band === 'at_risk' || r.risk_band === 'immediate_attention') && r.risk_band_change_7d === 'changed')
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: `Moved to ${r.risk_band.replace('_', ' ')}`,
          severity: r.risk_band === 'immediate_attention' ? 'critical' : 'warning',
        });
      });

    // Compliance drops >10 (7d)
    data.filter(r => r.delta_overall_score_7d <= -10)
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: `Compliance score dropped ${Math.abs(r.delta_overall_score_7d)} (7d)`,
          severity: r.delta_overall_score_7d <= -15 ? 'critical' : 'warning',
        });
      });

    // Active critical risks
    data.filter(r => r.has_active_critical)
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: 'New critical risk created',
          severity: 'critical',
        });
      });

    // Predictive spikes >20
    data.filter(r => r.delta_operational_risk_7d >= 20)
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: `Operational risk +${r.delta_operational_risk_7d} (7d)`,
          severity: 'critical',
        });
      });

    // Stalled >14 days
    data.filter(r => r.days_stale > 14)
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: `Phase stalled ${r.days_stale} days`,
          severity: r.days_stale > 21 ? 'critical' : 'warning',
        });
      });

    // Low consult hours
    data.filter(r => r.hours_remaining < 10 && r.hours_included > 0)
      .forEach(r => {
        result.push({
          client: r.client_name,
          owner: r.owner_user_uuid,
          what: `${r.hours_remaining}h consult hours remaining`,
          severity: r.hours_remaining <= 3 ? 'critical' : 'warning',
        });
      });

    // Deduplicate
    const seen = new Set<string>();
    return result.filter(s => {
      const key = `${s.client}|${s.what}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
    }).slice(0, 8);
  }, [data, anomalies]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Where We Must Talk</CardTitle>
        <p className="text-xs text-muted-foreground">
          {signals.length > 0 ? `${signals.length} items requiring discussion` : 'No items requiring discussion this week'}
        </p>
      </CardHeader>
      {signals.length > 0 && (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">What Changed</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Owner</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Severity</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium text-foreground max-w-[160px] truncate">{s.client}</td>
                    <td className="px-4 py-2.5 text-foreground text-xs">{s.what}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs truncate max-w-[100px]">
                      {s.owner ? s.owner.slice(0, 8) + '…' : '—'}
                    </td>
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
      )}
    </Card>
  );
}
