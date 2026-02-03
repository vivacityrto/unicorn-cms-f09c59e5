import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, Bell } from 'lucide-react';
import { useEosAlerts } from '@/hooks/useEosAlerts';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '@/types/eosAlerts';
import { cn } from '@/lib/utils';

/**
 * Banner showing attention-required alerts on EOS Overview.
 */
export function AlertsBanner() {
  const { attentionRequired, isLoading } = useEosAlerts();

  if (isLoading || attentionRequired.length === 0) {
    return null;
  }

  // Find highest severity
  const hasIntervention = attentionRequired.some(a => a.severity === 'intervention_required');
  const severity = hasIntervention ? 'intervention_required' : 'attention_required';
  const colors = SEVERITY_COLORS[severity];

  return (
    <div className={cn(
      'flex items-center gap-3 p-4 rounded-lg border-2',
      colors.bg,
      colors.border
    )}>
      <div className={cn('p-2 rounded-full', colors.bg)}>
        <AlertTriangle className={cn('h-5 w-5', colors.text)} />
      </div>
      
      <div className="flex-1">
        <p className={cn('font-semibold', colors.text)}>
          {attentionRequired.length} Alert{attentionRequired.length > 1 ? 's' : ''} {SEVERITY_LABELS[severity]}
        </p>
        <p className="text-sm text-muted-foreground">
          {attentionRequired[0].message}
          {attentionRequired.length > 1 && ` and ${attentionRequired.length - 1} more`}
        </p>
      </div>
      
      <Link to="/eos/health">
        <Button variant="outline" className={cn(colors.text, colors.border)}>
          View Alerts
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

/**
 * Compact alert indicator for headers/sidebars.
 */
export function AlertIndicator() {
  const { newAlerts } = useEosAlerts();

  if (newAlerts.length === 0) {
    return null;
  }

  const hasIntervention = newAlerts.some(a => a.severity === 'intervention_required');
  const hasAttention = newAlerts.some(a => a.severity === 'attention_required');

  return (
    <Link to="/eos/health" className="relative">
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-5 w-5" />
        <span className={cn(
          'absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full text-[10px] font-bold flex items-center justify-center',
          hasIntervention ? 'bg-destructive text-destructive-foreground' :
          hasAttention ? 'bg-amber-500 dark:bg-amber-600 text-white' : 'bg-primary text-primary-foreground'
        )}>
          {newAlerts.length > 9 ? '9+' : newAlerts.length}
        </span>
      </Button>
    </Link>
  );
}
