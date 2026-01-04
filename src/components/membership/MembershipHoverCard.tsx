import { ReactNode } from 'react';
import { Clock, Calendar, User, AlertTriangle, Plus, MessageSquare, ListTodo } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MembershipWithDetails } from '@/types/membership';
import { formatDistanceToNow } from 'date-fns';

interface MembershipHoverCardProps {
  membership: MembershipWithDetails;
  children: ReactNode;
}

export function MembershipHoverCard({ membership, children }: MembershipHoverCardProps) {
  const lastActivityText = membership.last_activity_at 
    ? formatDistanceToNow(new Date(membership.last_activity_at), { addSuffix: true })
    : 'No activity recorded';

  // Determine next recommended action
  const getNextAction = () => {
    if (!membership.setup_complete) {
      return { text: 'Complete client setup', priority: 'high' };
    }
    if (membership.health_check_status === 'not_scheduled') {
      return { text: 'Schedule Compliance Health Check', priority: 'medium' };
    }
    if (membership.validation_status === 'not_scheduled') {
      return { text: 'Schedule Assessment Validation', priority: 'medium' };
    }
    if (membership.tier.hoursIncluded > 0) {
      const pct = (membership.hours_used_current_month / membership.tier.hoursIncluded) * 100;
      if (pct >= 90) {
        return { text: 'Review hours usage - at capacity', priority: 'high' };
      }
    }
    if (!membership.last_activity_at) {
      return { text: 'Schedule initial check-in', priority: 'medium' };
    }
    const daysSince = Math.floor((Date.now() - new Date(membership.last_activity_at).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 21) {
      return { text: 'Follow up - no recent activity', priority: 'high' };
    }
    return { text: 'Regular check-in', priority: 'low' };
  };

  const nextAction = getNextAction();

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="right" align="start">
        <div className="space-y-3">
          {/* Header */}
          <div>
            <h4 className="font-semibold text-foreground">{membership.tenant_name}</h4>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className={membership.tier.color}>
                {membership.tier.fullText}
              </Badge>
              <span className="capitalize">{membership.membership_state.replace('_', ' ')}</span>
            </div>
          </div>

          {/* Last Activity */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Last activity:</span>
            <span className="font-medium">{lastActivityText}</span>
          </div>

          {/* CSC */}
          {membership.csc_name && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">CSC:</span>
              <span className="font-medium">{membership.csc_name}</span>
            </div>
          )}

          {/* Risk Flags */}
          {membership.health_score.risk_factors.length > 0 && (
            <div className="p-2 rounded bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-xs font-medium text-amber-700">Risk Flags</span>
              </div>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {membership.health_score.risk_factors.map((rf, idx) => (
                  <li key={idx}>• {rf.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Action */}
          <div className={`p-2 rounded border ${
            nextAction.priority === 'high' ? 'bg-red-50 border-red-200' :
            nextAction.priority === 'medium' ? 'bg-blue-50 border-blue-200' :
            'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Next Recommended Action</span>
            </div>
            <p className="text-sm">{nextAction.text}</p>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1">
              <ListTodo className="h-3 w-3" />
              Task
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1">
              <MessageSquare className="h-3 w-3" />
              Note
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1">
              <Plus className="h-3 w-3" />
              Consult
            </Button>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
