import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Lock, AlertTriangle, ChevronDown, ChevronRight, CheckCircle2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { PhaseProgressSummary } from '@/types/checkpoint-phase';

interface PhaseGroupHeaderProps {
  phase: PhaseProgressSummary;
  children: React.ReactNode;
  /** If true, the user cannot interact with close/manage actions */
  readOnly?: boolean;
}

/**
 * Collapsible header for a phase group in the runtime stage view.
 * Shows phase title, gate icon, progress bar, and status badge.
 */
export function PhaseGroupHeader({ phase, children, readOnly = false }: PhaseGroupHeaderProps) {
  const [isOpen, setIsOpen] = useState(true);

  const progressPct = phase.required_stages > 0
    ? Math.round((phase.completed_required / phase.required_stages) * 100)
    : 100;

  const statusColor = (() => {
    switch (phase.status) {
      case 'completed': return 'text-green-600 border-green-500/30 bg-green-500/10';
      case 'completed_with_exceptions': return 'text-amber-600 border-amber-500/30 bg-amber-500/10';
      case 'in_progress': return 'text-blue-600 border-blue-500/30 bg-blue-500/10';
      case 'on_hold': return 'text-muted-foreground border-border bg-muted/50';
      default: return 'text-muted-foreground border-border';
    }
  })();

  const gateIcon = (() => {
    if (phase.gate_type === 'hard') return <Lock className="h-3.5 w-3.5 text-destructive" />;
    if (phase.gate_type === 'soft') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    return null;
  })();

  const statusLabel = phase.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border bg-card overflow-hidden mb-2">
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors">
            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}

            {phase.status === 'completed' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            ) : gateIcon ? (
              <span className="shrink-0">{gateIcon}</span>
            ) : (
              <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{phase.phase_title}</span>
                <Badge variant="outline" className={cn("text-xs", statusColor)}>
                  {statusLabel}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={progressPct} className="h-1.5 flex-1 max-w-[200px]" />
                <span className="text-xs text-muted-foreground">
                  {phase.completed_required}/{phase.required_stages} required
                </span>
              </div>
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pl-10">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
