import { Info, MessageCircle, AlertTriangle, Lightbulb, CheckCircle } from 'lucide-react';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';
import { cn } from '@/lib/utils';

interface FacilitatorPromptProps {
  /** The prompt message to display */
  message: string;
  /** Type of prompt affects styling */
  type?: 'info' | 'reminder' | 'warning' | 'suggestion' | 'success';
  /** Optional additional context */
  context?: string;
  /** Optional className override */
  className?: string;
}

/**
 * Subtle, non-blocking prompt shown to facilitators.
 * Provides guidance during EOS sessions without interrupting flow.
 */
export function FacilitatorPrompt({
  message,
  type = 'info',
  context,
  className,
}: FacilitatorPromptProps) {
  const { isFacilitatorMode } = useFacilitatorMode();

  if (!isFacilitatorMode) {
    return null;
  }

  const icons = {
    info: Info,
    reminder: MessageCircle,
    warning: AlertTriangle,
    suggestion: Lightbulb,
    success: CheckCircle,
  };

  const styles = {
    info: 'bg-blue-50/50 border-blue-200/50 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800/50 dark:text-blue-200',
    reminder: 'bg-purple-50/50 border-purple-200/50 text-purple-800 dark:bg-purple-950/30 dark:border-purple-800/50 dark:text-purple-200',
    warning: 'bg-amber-50/50 border-amber-200/50 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800/50 dark:text-amber-200',
    suggestion: 'bg-emerald-50/50 border-emerald-200/50 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800/50 dark:text-emerald-200',
    success: 'bg-green-50/50 border-green-200/50 text-green-800 dark:bg-green-950/30 dark:border-green-800/50 dark:text-green-200',
  };

  const Icon = icons[type];

  return (
    <div
      className={cn(
        'flex items-start gap-2 p-3 rounded-md border text-sm',
        styles[type],
        className
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">{message}</p>
        {context && (
          <p className="text-xs opacity-80">{context}</p>
        )}
      </div>
    </div>
  );
}

// Pre-defined EOS prompts for common situations

/**
 * Prompt for Rock Review section - no discussion reminder
 */
export function RockReviewPrompt() {
  return (
    <FacilitatorPrompt
      type="reminder"
      message="No discussion in Rock Review"
      context="Quick status update only - On Track or Off Track. Move discussions to IDS."
    />
  );
}

/**
 * Prompt for IDS section - stay focused
 */
export function IDSPrompt() {
  return (
    <FacilitatorPrompt
      type="info"
      message="IDS only during IDS section"
      context="Identify → Discuss → Solve. Ensure each issue gets a clear resolution."
    />
  );
}

/**
 * Prompt for Scorecard review
 */
export function ScorecardPrompt() {
  return (
    <FacilitatorPrompt
      type="reminder"
      message="Review metrics quickly"
      context="Flag off-track numbers for IDS. Don't solve problems here."
    />
  );
}

/**
 * Prompt when rock is off-track
 */
export function OffTrackRockPrompt({ rockTitle }: { rockTitle: string }) {
  return (
    <FacilitatorPrompt
      type="warning"
      message="This Rock may need escalation"
      context={`"${rockTitle}" has been off-track. Consider adding to IDS for discussion.`}
    />
  );
}

/**
 * Prompt for IDS decision confirmation
 */
export function IDSDecisionPrompt() {
  return (
    <FacilitatorPrompt
      type="suggestion"
      message="Is this solved?"
      context="Confirm resolution before moving to next issue. Create To-Dos if actions needed."
    />
  );
}

/**
 * Prompt for meeting rating
 */
export function MeetingRatingPrompt() {
  return (
    <FacilitatorPrompt
      type="info"
      message="Collect meeting ratings"
      context="Ask each attendee to rate the meeting 1-10 before concluding."
    />
  );
}

/**
 * Prompt for low quorum
 */
export function QuorumWarningPrompt() {
  return (
    <FacilitatorPrompt
      type="warning"
      message="Quorum check needed"
      context="Key decision-makers may be missing. Consider rescheduling for full attendance."
    />
  );
}
