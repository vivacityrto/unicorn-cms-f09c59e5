import { Ban, Check, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSetRockStatus } from '@/hooks/useRockDiscussion';
import { dbToUiStatus, getStatusConfig } from '@/utils/rockStatusUtils';

type Choice = 'on_track' | 'at_risk' | 'off_track';
const CHOICES: ReadonlyArray<{ value: Choice; label: string }> = [
  { value: 'on_track', label: 'On track' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'off_track', label: 'Off track' },
];

interface RockStatusDecisionProps {
  rock: { id: string; title: string; status: string | null };
  /** The Rock is in this meeting's review scope, so its status can be set here. */
  canChange: boolean;
  confirmed: boolean;
  onOutcome: (outcome: 'confirmed' | 'changed') => void;
  onBlock: () => void;
  onResolve: () => void;
}

/**
 * The yes/no the segment exists for. Pressing the status a Rock already has confirms it;
 * pressing another changes it. Blocked is a separate button because it needs a reason.
 */
export function RockStatusDecision({ rock, canChange, confirmed, onOutcome, onBlock, onResolve }: RockStatusDecisionProps) {
  const setStatus = useSetRockStatus();
  const current = dbToUiStatus(rock.status);
  const blocked = current === 'blocked';
  const config = getStatusConfig(current);

  const choose = async (value: Choice) => {
    if (value === current) {
      onOutcome('confirmed');
      return;
    }
    try {
      await setStatus.mutateAsync({ id: rock.id, status: value });
      onOutcome('changed');
    } catch {
      // The mutation has already said what went wrong; the status stays as it was.
    }
  };

  if (!canChange) {
    return (
      <section aria-label="Status" className="space-y-1 rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Status</h3>
        <p className={cn('text-lg font-semibold', config.color)}>{config.label}</p>
        <p className="text-xs text-muted-foreground">This level is not reviewed in this meeting, so it is shown for context.</p>
      </section>
    );
  }

  return (
    <section aria-label="Status" className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Is it on track?</h3>
        {confirmed && (
          <span role="status" className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Confirmed
          </span>
        )}
      </div>

      {blocked ? (
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-base font-semibold text-violet-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-200">
            <Ban className="h-5 w-5" aria-hidden />
            Blocked
          </p>
          <p className="text-xs text-muted-foreground">Stays blocked until its blocker is resolved. Resolving does not mark it complete.</p>
          <Button type="button" className="h-10 w-full" onClick={onResolve}>Resolve blocker…</Button>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Set the status" className="grid grid-cols-3 gap-2">
            {CHOICES.map(choice => {
              const selected = choice.value === current;
              return (
                <Button
                  key={choice.value}
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  aria-pressed={selected}
                  disabled={setStatus.isPending}
                  className={cn('h-10 gap-1 px-2 text-sm lg:text-base', selected && choice.value === 'off_track' && 'bg-red-600 hover:bg-red-700', selected && choice.value === 'at_risk' && 'bg-amber-600 hover:bg-amber-700', selected && choice.value === 'on_track' && 'bg-green-600 hover:bg-green-700')}
                  onClick={() => void choose(choice.value)}
                >
                  {setStatus.isPending && setStatus.variables?.status === choice.value ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : selected && <Check className="h-4 w-4" aria-hidden />}
                  {choice.label}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {current === 'not_started' ? 'Not started. Pick a status to record one.' : 'Press the current status to confirm it.'}
          </p>
          <Button type="button" variant="outline" className="h-9 w-full gap-2 border-violet-300 text-violet-900 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-950/30" onClick={onBlock}>
            <Ban className="h-4 w-4" aria-hidden />
            It is blocked…
          </Button>
        </>
      )}
    </section>
  );
}
