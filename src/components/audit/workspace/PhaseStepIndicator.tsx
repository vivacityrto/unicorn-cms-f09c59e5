import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuditPhase } from '@/types/auditWorkspace';

interface PhaseInfo {
  key: AuditPhase;
  label: string;
  number: number;
  isComplete: boolean;
  questionCount: number;
  answeredCount: number;
}

interface PhaseStepIndicatorProps {
  phases: PhaseInfo[];
  activePhase: AuditPhase;
  onPhaseClick: (phase: AuditPhase) => void;
}

export function PhaseStepIndicator({ phases, activePhase, onPhaseClick }: PhaseStepIndicatorProps) {
  return (
    <div className="flex items-center justify-between mb-6 bg-muted/30 rounded-lg p-3">
      {phases.map((phase, idx) => (
        <div key={phase.key} className="flex items-center flex-1">
          <button
            onClick={() => onPhaseClick(phase.key)}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all w-full',
              activePhase === phase.key
                ? 'bg-background shadow-sm border border-border'
                : 'hover:bg-background/50'
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0',
                phase.isComplete
                  ? 'bg-green-100 text-green-700'
                  : activePhase === phase.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {phase.isComplete ? <Check className="h-4 w-4" /> : phase.number}
            </div>
            <div className="text-left min-w-0">
              <p className={cn(
                'text-sm font-medium truncate',
                activePhase === phase.key ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {phase.label}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {phase.answeredCount} / {phase.questionCount}
              </p>
            </div>
          </button>
          {idx < phases.length - 1 && (
            <div className="w-8 h-px bg-border mx-1 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}
