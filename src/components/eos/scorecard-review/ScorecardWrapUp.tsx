import { CheckCircle2, CircleAlert, MessageSquareWarning, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WrapUpSummary } from '@/features/eos-scorecard/discussion';

interface ScorecardWrapUpProps {
  summary: WrapUpSummary;
  onClose: () => void;
  onGoTo: (areaName: string) => void;
}

function Group({ icon: Icon, title, items, tone }: { icon: typeof CheckCircle2; title: string; items: string[]; tone?: string }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className={`flex items-center gap-2 text-base font-semibold ${tone ?? ''}`}>
        <Icon className="h-5 w-5" aria-hidden />
        {title} <span className="font-normal text-muted-foreground">({items.length})</span>
      </h3>
      <ul className="list-disc space-y-1 pl-9 text-base">
        {items.map((item) => (
          <li key={item} className="break-words">{item}</li>
        ))}
      </ul>
    </section>
  );
}

/** The last slide: what came of each area, and the ones that still need the room. */
export function ScorecardWrapUp({ summary, onClose, onGoTo }: ScorecardWrapUpProps) {
  return (
    <section aria-label="Wrap-up" className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h2 tabIndex={-1} data-slide-heading className="text-2xl font-bold outline-none sm:text-3xl lg:text-5xl">Wrap-up</h2>
        <p className="text-lg text-muted-foreground">
          {summary.visited} of {summary.total} {summary.total === 1 ? 'area' : 'areas'} looked at.
        </p>
      </header>

      {summary.unresolved.length > 0 && (
        <section role="alert" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <h3 className="flex items-center gap-2 text-base font-semibold text-amber-900 dark:text-amber-200">
            <CircleAlert className="h-5 w-5" aria-hidden />
            Needs the room, and nothing raised or noted
          </h3>
          <ul className="space-y-2">
            {summary.unresolved.map((name) => (
              <li key={name} className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-words text-base">{name}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => onGoTo(name)}>Go back to it</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Group icon={MessageSquareWarning} title="Raised for IDS" items={summary.raised} tone="text-primary" />
      <Group icon={NotebookPen} title="Notes written" items={summary.noted} />
      <Group icon={CircleAlert} title="Not reached" items={summary.unvisited} tone="text-muted-foreground" />

      {summary.visited === 0 && <p className="text-base text-muted-foreground">Nothing was noted or raised.</p>}

      <Button type="button" className="h-12 px-8 text-base" onClick={onClose}>Back to the meeting</Button>
    </section>
  );
}
