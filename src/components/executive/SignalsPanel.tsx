/**
 * SignalsPanel – Unicorn 2.0
 *
 * Shows anomaly counts and list for the Executive Dashboard.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';
import type { AnomalyRow } from '@/hooks/useExecutiveAnomalies';
import { getAnomalyLabel } from '@/hooks/useExecutiveAnomalies';

interface SignalsPanelProps {
  anomalies: AnomalyRow[];
}

const severityStyles: Record<string, string> = {
  critical: 'bg-brand-fuchsia-100 text-brand-fuchsia-700 dark:bg-brand-fuchsia-900 dark:text-brand-fuchsia-200',
  warning: 'bg-brand-macaron-100 text-brand-macaron-700 dark:bg-brand-macaron-900 dark:text-brand-macaron-200',
  info: 'bg-brand-purple-100 text-brand-purple-700 dark:bg-brand-purple-900 dark:text-brand-purple-200',
};

export function SignalsPanel({ anomalies }: SignalsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  const warningCount = anomalies.filter(a => a.severity === 'warning').length;
  const shown = expanded ? anomalies : anomalies.slice(0, 5);

  if (anomalies.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-brand-fuchsia-600" />
            Signals (last 30 days)
          </CardTitle>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge className={cn('text-xs', severityStyles.critical)}>
                {criticalCount} critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge className={cn('text-xs', severityStyles.warning)}>
                {warningCount} warning{warningCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{anomalies.length} unusual changes detected</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[300px] overflow-y-auto">
          {shown.map((a, i) => (
            <div
              key={`${a.tenant_id}-${a.package_instance_id}-${a.anomaly_type}-${i}`}
              className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">
                  {getAnomalyLabel(a.anomaly_type)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a.delta_value !== 0 && (
                    <span>{a.delta_value > 0 ? '+' : ''}{a.delta_value} over {a.window_days}d</span>
                  )}
                  {a.anomaly_type === 'snapshot_gap' && (
                    <span>Only {a.current_value} points in 30 days</span>
                  )}
                </p>
              </div>
              <Badge className={cn('text-[10px] capitalize shrink-0', severityStyles[a.severity] || severityStyles.info)}>
                {a.severity}
              </Badge>
            </div>
          ))}
        </div>
        {anomalies.length > 5 && (
          <button
            className="w-full px-4 py-2 text-xs text-primary hover:underline text-center border-t border-border"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show less' : `View all ${anomalies.length} signals`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
