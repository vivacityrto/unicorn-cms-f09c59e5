import { AlertCircle, CheckCircle, Clock, FileText, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';
import type { QCStatus } from '@/types/qc';

interface QCConversation {
  id: string;
  status: QCStatus;
  reviewee_id: string;
  scheduled_at?: string | null;
  completed_at?: string | null;
  // Extended fields for display
  revieweeName?: string;
  managerSectionComplete?: boolean;
  revieweeSectionComplete?: boolean;
}

interface QCInsightsProps {
  conversations: QCConversation[];
}

/**
 * Facilitator insights for Quarterly Conversations.
 * Shows:
 * - Completion indicators (manager/team member sections)
 * - Conversations stuck in Draft
 * - Neutral facilitation prompts
 */
export function QCInsights({ conversations }: QCInsightsProps) {
  const { isFacilitatorMode } = useFacilitatorMode();

  if (!isFacilitatorMode || !conversations?.length) {
    return null;
  }

  // Calculate stats
  const total = conversations.length;
  const completed = conversations.filter(c => c.status === 'completed').length;
  const inProgress = conversations.filter(c => c.status === 'in_progress').length;
  const scheduled = conversations.filter(c => c.status === 'scheduled').length;
  const stuckInDraft = conversations.filter(c => 
    c.status === 'in_progress' && 
    c.scheduled_at && 
    new Date(c.scheduled_at) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );

  const completionRate = total > 0 ? (completed / total) * 100 : 0;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          QC Facilitation Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Completion Overview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Completion Rate</span>
            <span className="font-medium">{completed}/{total} complete</span>
          </div>
          <Progress value={completionRate} className="h-2" />
        </div>

        {/* Status Breakdown */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-md bg-background border">
            <p className="text-lg font-semibold text-emerald-600">{completed}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
          <div className="p-2 rounded-md bg-background border">
            <p className="text-lg font-semibold text-blue-600">{inProgress}</p>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </div>
          <div className="p-2 rounded-md bg-background border">
            <p className="text-lg font-semibold text-muted-foreground">{scheduled}</p>
            <p className="text-xs text-muted-foreground">Scheduled</p>
          </div>
        </div>

        {/* Stuck Conversations Warning */}
        {stuckInDraft.length > 0 && (
          <div className="p-3 rounded-md bg-amber-50/50 border border-amber-200/50 dark:bg-amber-950/30 dark:border-amber-800/50">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {stuckInDraft.length} conversation{stuckInDraft.length > 1 ? 's' : ''} may be stalled
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                  Started over a week ago but not yet completed. Consider following up.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Facilitation Prompts */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Facilitation Notes
          </p>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-3 w-3 mt-0.5 text-emerald-500" />
              <span>Manager section: Feedback and coaching notes</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-3 w-3 mt-0.5 text-emerald-500" />
              <span>Team member section: Self-assessment and goals</span>
            </li>
            <li className="flex items-start gap-2">
              <FileText className="h-3 w-3 mt-0.5 text-blue-500" />
              <span>Both parties must sign to complete</span>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
