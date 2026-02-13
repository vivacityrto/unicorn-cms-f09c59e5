import { cn } from '@/lib/utils';
import { Check, Lock, AlertTriangle, Circle } from 'lucide-react';

/**
 * Phase Step Indicator – Unicorn 2.0 Design System
 *
 * Shows progress through compliance phases or wizard steps.
 *
 * States:
 * - completed: Purple with check
 * - current: Highlighted purple ring
 * - locked: Muted, lock icon
 * - risk: Macaron or Fuchsia flag
 * - pending: Default muted
 */

export type StepStatus = 'completed' | 'current' | 'locked' | 'risk' | 'pending';

interface StepItem {
  id: string;
  label: string;
  status: StepStatus;
  /** Optional risk level for 'risk' status */
  riskLevel?: 'warning' | 'critical';
}

interface PhaseStepsProps {
  steps: StepItem[];
  /** Vertical or horizontal layout */
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

const STATUS_STYLES: Record<StepStatus, { ring: string; bg: string; icon: typeof Check; iconClass: string }> = {
  completed: {
    ring: 'border-primary bg-primary',
    bg: 'bg-primary',
    icon: Check,
    iconClass: 'text-primary-foreground',
  },
  current: {
    ring: 'border-primary ring-2 ring-primary/30 bg-background',
    bg: 'bg-primary/10',
    icon: Circle,
    iconClass: 'text-primary',
  },
  pending: {
    ring: 'border-muted-foreground/30 bg-muted',
    bg: 'bg-muted',
    icon: Circle,
    iconClass: 'text-muted-foreground',
  },
  locked: {
    ring: 'border-muted-foreground/20 bg-muted/50',
    bg: 'bg-muted/50',
    icon: Lock,
    iconClass: 'text-muted-foreground',
  },
  risk: {
    ring: 'border-destructive bg-destructive/10',
    bg: 'bg-destructive/10',
    icon: AlertTriangle,
    iconClass: 'text-destructive',
  },
};

export function PhaseSteps({ steps, orientation = 'horizontal', className }: PhaseStepsProps) {
  const isVertical = orientation === 'vertical';

  return (
    <div
      className={cn(
        'flex gap-2',
        isVertical ? 'flex-col' : 'flex-row items-center',
        className,
      )}
    >
      {steps.map((step, idx) => {
        const style = STATUS_STYLES[step.status];
        // Risk steps use macaron for warning, fuchsia for critical
        const riskRing =
          step.status === 'risk' && step.riskLevel === 'warning'
            ? 'border-brand-macaron bg-brand-macaron-50'
            : style.ring;
        const riskIcon =
          step.status === 'risk' && step.riskLevel === 'warning'
            ? 'text-brand-macaron-700'
            : style.iconClass;
        const Icon = style.icon;

        return (
          <div key={step.id} className={cn('flex items-center gap-2', isVertical ? '' : '')}>
            {/* Connector line */}
            {idx > 0 && (
              <div
                className={cn(
                  isVertical
                    ? 'w-0.5 h-4 ml-4 -mt-2 -mb-1'
                    : 'h-0.5 w-6 -mx-1',
                  steps[idx - 1].status === 'completed'
                    ? 'bg-primary'
                    : 'bg-muted-foreground/20',
                )}
              />
            )}

            {/* Step circle */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-200',
                  step.status === 'risk' ? riskRing : style.ring,
                )}
              >
                <Icon className={cn('h-4 w-4', step.status === 'risk' ? riskIcon : style.iconClass)} />
              </div>
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  step.status === 'completed' && 'text-primary',
                  step.status === 'current' && 'text-primary font-semibold',
                  step.status === 'locked' && 'text-muted-foreground',
                  step.status === 'pending' && 'text-muted-foreground',
                  step.status === 'risk' && step.riskLevel === 'warning' && 'text-brand-macaron-700',
                  step.status === 'risk' && step.riskLevel !== 'warning' && 'text-destructive',
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
