import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Lightbulb,
  MinusCircle,
  ArrowRight,
  UserPlus,
  Scissors,
  Settings,
  Users,
  UserX,
  Check,
  X,
  Eye,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSeatHealth } from '@/hooks/useSeatHealth';
import type { SeatRebalancingRecommendation, RecommendationType, RecommendationStatus, RecommendationSeverity } from '@/types/seatHealth';
import { RECOMMENDATION_TYPE_CONFIG } from '@/types/seatHealth';
import { useAuth } from '@/hooks/useAuth';

interface RecommendationsPanelProps {
  seatId?: string;
  recommendations?: SeatRebalancingRecommendation[];
  showAll?: boolean;
  showHistory?: boolean;
  maxVisible?: number;
}

export function RecommendationsPanel({ 
  seatId, 
  recommendations: propRecommendations,
  showAll = false,
  showHistory = false,
  maxVisible = 5,
}: RecommendationsPanelProps) {
  const { recommendations: allRecs, getSeatRecommendations, updateRecommendation } = useSeatHealth();
  const { profile, isSuperAdmin } = useAuth();
  
  // Check if user can dismiss - Super Admin or Team Leader role
  const canDismiss = isSuperAdmin() || profile?.unicorn_role === 'Team Leader';
  
  // Check if user can view (hide from Team Member)
  const canView = isSuperAdmin() || profile?.unicorn_role === 'Team Leader' || profile?.unicorn_role === 'Team Member';
  
  if (!canView) return null;
  
  const recommendations = propRecommendations 
    || (seatId ? getSeatRecommendations(seatId) : allRecs)
    || [];
  
  const activeRecs = showAll 
    ? recommendations 
    : recommendations.filter(r => r.status === 'new' || r.status === 'acknowledged');
  
  const historyRecs = recommendations.filter(r => r.status === 'action_taken' || r.status === 'dismissed');
  
  // Sort by severity (high first) then by date
  const sortedRecs = [...activeRecs]
    .sort((a, b) => {
      if (a.severity === 'high' && b.severity !== 'high') return -1;
      if (a.severity !== 'high' && b.severity === 'high') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, maxVisible);

  if (sortedRecs.length === 0 && !showHistory) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Rebalancing Suggestions
          <div className="flex items-center gap-1 ml-auto">
            {sortedRecs.filter(r => r.severity === 'high').length > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {sortedRecs.filter(r => r.severity === 'high').length} high priority
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {sortedRecs.filter(r => r.status === 'new').length} new
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground italic">
          Advisory suggestions only. Leadership decides.
        </p>
        
        {sortedRecs.map((rec) => (
          <RecommendationCard 
            key={rec.id} 
            recommendation={rec}
            canDismiss={canDismiss}
            onAcknowledge={() => updateRecommendation.mutate({ id: rec.id, status: 'acknowledged' })}
            onResolve={() => updateRecommendation.mutate({ id: rec.id, status: 'action_taken' })}
            onDismiss={(reason) => updateRecommendation.mutate({ id: rec.id, status: 'dismissed', dismissed_reason: reason })}
          />
        ))}
        
        {activeRecs.length > maxVisible && (
          <p className="text-xs text-muted-foreground text-center">
            +{activeRecs.length - maxVisible} more suggestions
          </p>
        )}
        
        {/* History accordion */}
        {showHistory && historyRecs.length > 0 && (
          <>
            <Separator className="my-3" />
            <Accordion type="single" collapsible>
              <AccordionItem value="history" className="border-none">
                <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                  <div className="flex items-center gap-2">
                    <History className="h-3 w-3" />
                    Past Suggestions ({historyRecs.length})
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pt-2">
                  {historyRecs.slice(0, 5).map((rec) => (
                    <HistoryCard key={rec.id} recommendation={rec} />
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const ICON_MAP: Record<RecommendationType, React.FC<{ className?: string }>> = {
  reduce_rock_load: MinusCircle,
  move_rock: ArrowRight,
  add_backup: UserPlus,
  split_seat: Scissors,
  seat_redesign: Settings,
  people_review: Users,
  vacant_seat: UserX,
};

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
  
  const Icon = ICON_MAP[recommendation.recommendation_type] || Lightbulb;

  const statusColors: Record<RecommendationStatus, string> = {
    new: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    acknowledged: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    action_taken: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    dismissed: 'bg-muted text-muted-foreground',
  };
  
  const severityStyles: Record<RecommendationSeverity, { border: string; bg: string }> = {
    high: { border: 'border-amber-300 dark:border-amber-700', bg: 'bg-amber-50/50 dark:bg-amber-950/20' },
    medium: { border: 'border-muted', bg: 'bg-muted/30' },
  };

  const handleDismiss = () => {
    if (dismissReason.trim()) {
      onDismiss(dismissReason);
      setShowDismissDialog(false);
      setDismissReason('');
    }
  };

  const severity = recommendation.severity || 'medium';

  return (
    <>
      <div className={cn(
        'p-3 rounded-lg border space-y-2',
        severityStyles[severity].border,
        severityStyles[severity].bg
      )}>
        <div className="flex items-start gap-2">
          <Icon className={cn(
            'h-4 w-4 mt-0.5 shrink-0',
            severity === 'high' ? 'text-amber-600' : 'text-muted-foreground'
          )} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-medium">{recommendation.title}</span>
              {severity === 'high' && (
                <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700">
                  High
                </Badge>
              )}
              <Badge className={cn('text-[10px]', statusColors[recommendation.status])}>
                {recommendation.status === 'new' ? 'New' 
                  : recommendation.status === 'acknowledged' ? 'Reviewing'
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
          <div className="flex items-center gap-2 pt-1 flex-wrap">
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
            <DialogTitle>Dismiss Suggestion</DialogTitle>
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

function HistoryCard({ recommendation }: { recommendation: SeatRebalancingRecommendation }) {
  const Icon = ICON_MAP[recommendation.recommendation_type] || Lightbulb;
  const isResolved = recommendation.status === 'action_taken';
  
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 text-muted-foreground">
      <Icon className="h-3 w-3 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] truncate">{recommendation.title}</p>
        <p className="text-[10px]">
          {isResolved ? 'Resolved' : 'Dismissed'} • {new Date(recommendation.created_at).toLocaleDateString()}
        </p>
      </div>
      <Badge variant="outline" className="text-[9px] shrink-0">
        {isResolved ? '✓' : '✕'}
      </Badge>
    </div>
  );
}
