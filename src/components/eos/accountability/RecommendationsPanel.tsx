import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Lightbulb,
  MinusCircle,
  ArrowRight,
  UserPlus,
  Scissors,
  Check,
  X,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSeatHealth } from '@/hooks/useSeatHealth';
import type { SeatRebalancingRecommendation, RecommendationType, RecommendationStatus } from '@/types/seatHealth';
import { RECOMMENDATION_TYPE_CONFIG } from '@/types/seatHealth';
import { useAuth } from '@/hooks/useAuth';

interface RecommendationsPanelProps {
  seatId?: string;
  recommendations?: SeatRebalancingRecommendation[];
  showAll?: boolean;
}

export function RecommendationsPanel({ 
  seatId, 
  recommendations: propRecommendations,
  showAll = false 
}: RecommendationsPanelProps) {
  const { recommendations: allRecs, getSeatRecommendations, updateRecommendation } = useSeatHealth();
  const { profile, isSuperAdmin } = useAuth();
  
  // Check if user can dismiss - Super Admin or Team Leader role
  const canDismiss = isSuperAdmin() || profile?.unicorn_role === 'Team Leader';
  
  const recommendations = propRecommendations 
    || (seatId ? getSeatRecommendations(seatId) : allRecs)
    || [];
  
  const activeRecs = showAll 
    ? recommendations 
    : recommendations.filter(r => r.status === 'new' || r.status === 'acknowledged');

  if (activeRecs.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Rebalancing Suggestions
          <Badge variant="outline" className="ml-auto text-xs">
            {activeRecs.filter(r => r.status === 'new').length} new
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeRecs.map((rec) => (
          <RecommendationCard 
            key={rec.id} 
            recommendation={rec}
            canDismiss={canDismiss}
            onAcknowledge={() => updateRecommendation.mutate({ id: rec.id, status: 'acknowledged' })}
            onResolve={() => updateRecommendation.mutate({ id: rec.id, status: 'action_taken' })}
            onDismiss={(reason) => updateRecommendation.mutate({ id: rec.id, status: 'dismissed', dismissed_reason: reason })}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface RecommendationCardProps {
  recommendation: SeatRebalancingRecommendation;
  canDismiss: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
  onDismiss: (reason: string) => void;
}

function RecommendationCard({ 
  recommendation, 
  canDismiss,
  onAcknowledge,
  onResolve,
  onDismiss,
}: RecommendationCardProps) {
  const [showDismissDialog, setShowDismissDialog] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  
  const config = RECOMMENDATION_TYPE_CONFIG[recommendation.recommendation_type];
  const Icon = recommendation.recommendation_type === 'reduce_rock_load' ? MinusCircle
    : recommendation.recommendation_type === 'move_rock' ? ArrowRight
    : recommendation.recommendation_type === 'add_backup' ? UserPlus
    : Scissors;

  const statusColors: Record<RecommendationStatus, string> = {
    new: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    acknowledged: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    action_taken: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    dismissed: 'bg-muted text-muted-foreground',
  };

  const handleDismiss = () => {
    if (dismissReason.trim()) {
      onDismiss(dismissReason);
      setShowDismissDialog(false);
      setDismissReason('');
    }
  };

  return (
    <>
      <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
        <div className="flex items-start gap-2">
          <Icon className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">{recommendation.title}</span>
              <Badge className={cn('text-[10px]', statusColors[recommendation.status])}>
                {recommendation.status === 'new' ? 'New' 
                  : recommendation.status === 'acknowledged' ? 'Acknowledged'
                  : recommendation.status === 'action_taken' ? 'Resolved'
                  : 'Dismissed'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {recommendation.description}
            </p>
          </div>
        </div>

        {/* Actions */}
        {(recommendation.status === 'new' || recommendation.status === 'acknowledged') && (
          <div className="flex items-center gap-2 pt-1">
            {recommendation.status === 'new' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 gap-1"
                      onClick={onAcknowledge}
                    >
                      <Eye className="h-3 w-3" />
                      Acknowledge
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Mark as seen and under review</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="h-7 gap-1"
                    onClick={onResolve}
                  >
                    <Check className="h-3 w-3" />
                    Action Taken
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Mark as resolved</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {canDismiss && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 gap-1 text-muted-foreground ml-auto"
                      onClick={() => setShowDismissDialog(true)}
                    >
                      <X className="h-3 w-3" />
                      Dismiss
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Dismiss this suggestion (requires reason)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}

        {/* Dismissed info */}
        {recommendation.status === 'dismissed' && recommendation.dismissed_reason && (
          <p className="text-[10px] text-muted-foreground italic">
            Dismissed: {recommendation.dismissed_reason}
          </p>
        )}
      </div>

      {/* Dismiss Dialog */}
      <Dialog open={showDismissDialog} onOpenChange={setShowDismissDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Recommendation</DialogTitle>
            <DialogDescription>
              Please provide a reason for dismissing this suggestion. This will be logged for audit purposes.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter reason for dismissal..."
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDismissDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleDismiss} disabled={!dismissReason.trim()}>
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
