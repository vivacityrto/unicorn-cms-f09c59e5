/**
 * DrawerSignalsTab – Unicorn 2.0
 *
 * Lists anomalies for a specific client-package in the health drawer.
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AnomalyRow } from '@/hooks/useExecutiveAnomalies';
import { getAnomalyLabel, getAnomalyCta } from '@/hooks/useExecutiveAnomalies';

interface DrawerSignalsTabProps {
  anomalies: AnomalyRow[];
  tenantId: number;
  onClose: () => void;
}

const severityStyles: Record<string, string> = {
  critical: 'bg-brand-fuchsia-100 text-brand-fuchsia-700 dark:bg-brand-fuchsia-900 dark:text-brand-fuchsia-200',
  warning: 'bg-brand-macaron-100 text-brand-macaron-700 dark:bg-brand-macaron-900 dark:text-brand-macaron-200',
  info: 'bg-brand-purple-100 text-brand-purple-700 dark:bg-brand-purple-900 dark:text-brand-purple-200',
};

export function DrawerSignalsTab({ anomalies, tenantId, onClose }: DrawerSignalsTabProps) {
  const navigate = useNavigate();

  if (anomalies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No unusual changes detected in the last 30 days.</p>
    );
  }

  return (
    <div className="space-y-2">
      {anomalies.map((a, i) => {
        const cta = getAnomalyCta(a.anomaly_type);
        return (
          <button
            key={`${a.anomaly_type}-${i}`}
            className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors text-left"
            onClick={() => {
              onClose();
              navigate(`/manage-tenants/${tenantId}`);
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-foreground">{getAnomalyLabel(a.anomaly_type)}</p>
                <Badge className={cn('text-[10px] capitalize shrink-0', severityStyles[a.severity])}>
                  {a.severity}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {a.delta_value !== 0 ? `${a.delta_value > 0 ? '+' : ''}${a.delta_value} over ${a.window_days} days` : ''}
                {a.anomaly_type === 'snapshot_gap' ? `Only ${a.current_value} data points in 30 days` : ''}
                {a.baseline_value !== a.current_value && a.anomaly_type !== 'snapshot_gap' && ` · ${a.baseline_value} → ${a.current_value}`}
              </p>
              <p className="text-xs text-primary mt-1">{cta.label}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          </button>
        );
      })}
    </div>
  );
}
