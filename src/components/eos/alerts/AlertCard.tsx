import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  AlertCircle, 
  AlertTriangle, 
  Info,
  CheckCircle,
  Clock,
  ExternalLink,
  X,
  ArrowRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  type EosAlert, 
  SEVERITY_COLORS, 
  SEVERITY_LABELS,
  ALERT_TYPE_LABELS,
  STATUS_LABELS,
} from '@/types/eosAlerts';

const SEVERITY_ICONS = {
  informational: Info,
  attention_required: AlertTriangle,
  intervention_required: AlertCircle,
};

interface AlertCardProps {
  alert: EosAlert;
  onAcknowledge?: (alertId: string) => void;
  onDismiss?: (alertId: string, reason: string) => void;
  onAction?: (alertId: string) => void;
  compact?: boolean;
}

export function AlertCard({ 
  alert, 
  onAcknowledge, 
  onDismiss, 
  onAction,
  compact = false,
}: AlertCardProps) {
  const [showDismissDialog, setShowDismissDialog] = useState(false);
  const [dismissReason, setDismissReason] = useState('');

  const colors = SEVERITY_COLORS[alert.severity];
  const Icon = SEVERITY_ICONS[alert.severity];
  const timeAgo = formatDistanceToNow(new Date(alert.created_at), { addSuffix: true });

  const handleDismiss = () => {
    if (onDismiss && dismissReason.trim()) {
      onDismiss(alert.id, dismissReason);
      setShowDismissDialog(false);
      setDismissReason('');
    }
  };

  if (compact) {
    return (
      <div className={cn(
        'flex items-start gap-2 p-2 rounded-md border',
        colors.bg,
        colors.border
      )}>
        <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', colors.text)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium line-clamp-1">{alert.message}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ALERT_TYPE_LABELS[alert.alert_type]} · {timeAgo}
          </p>
        </div>
        {alert.details.link && (
          <Link to={alert.details.link}>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <Card className={cn('border', colors.border)}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={cn('p-2 rounded-lg', colors.bg)}>
                <Icon className={cn('h-5 w-5', colors.text)} />
              </div>
              <div>
                <CardTitle className="text-base">{alert.message}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={cn('text-xs', colors.bg, colors.text, colors.border)}>
                    {SEVERITY_LABELS[alert.severity]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {ALERT_TYPE_LABELS[alert.alert_type]}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{timeAgo}</span>
                </div>
              </div>
            </div>
            
            <Badge variant="secondary" className="text-xs">
              {STATUS_LABELS[alert.status]}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Details */}
          {alert.details.why_it_matters && (
            <div className="text-sm">
              <p className="font-medium text-muted-foreground mb-1">Why it matters</p>
              <p>{alert.details.why_it_matters}</p>
            </div>
          )}
          
          {alert.details.suggested_action && (
            <div className={cn('p-3 rounded-md', colors.bg)}>
              <p className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Suggested Action
              </p>
              <p className="text-sm mt-1">{alert.details.suggested_action}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 flex-wrap">
            {alert.details.link && (
              <Link to={alert.details.link}>
                <Button size="sm" className="gap-1">
                  Fix This
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            )}
            
            {alert.status === 'new' && onAcknowledge && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onAcknowledge(alert.id)}
              >
                <Clock className="h-3 w-3 mr-1" />
                Acknowledge
              </Button>
            )}
            
            {(alert.status === 'new' || alert.status === 'acknowledged') && onAction && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onAction(alert.id)}
              >
                Mark In Progress
              </Button>
            )}
            
            {alert.status !== 'dismissed' && onDismiss && (
              <Button 
                size="sm" 
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setShowDismissDialog(true)}
              >
                <X className="h-3 w-3 mr-1" />
                Dismiss
              </Button>
            )}
          </div>

          {/* Dismissed info */}
          {alert.status === 'dismissed' && alert.dismiss_reason && (
            <div className="p-2 rounded-md bg-muted/50 text-sm text-muted-foreground">
              <span className="font-medium">Dismissed:</span> {alert.dismiss_reason}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dismiss Dialog */}
      <Dialog open={showDismissDialog} onOpenChange={setShowDismissDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Alert</DialogTitle>
            <DialogDescription>
              Please provide a reason for dismissing this alert. This helps maintain accountability.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="reason">Reason for dismissal</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Not applicable to our situation because..."
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              className="mt-2"
            />
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDismissDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleDismiss}
              disabled={!dismissReason.trim()}
            >
              Dismiss Alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
