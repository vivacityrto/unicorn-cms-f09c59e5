import { CheckCircle2, CircleAlert, MessageSquareWarning, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WrapUp } from '@/utils/rockDiscussion';

interface DiscussWrapUpProps {
  summary: WrapUp;
  onClose: () => void;
  onGoTo: (title: string) => void;
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
        {items.map(item => <li key={item} className="break-words">{item}</li>)}
      </ul>
    </section>
  );
}

/** The last slide: what happened to each Rock, and the ones that look like they still need IDS. */
export function DiscussWrapUp({ summary, onClose, onGoTo }: DiscussWrapUpProps) {
  return (
    <section aria-label="Wrap-up" className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h2 tabIndex={-1} data-slide-heading className="text-2xl font-bold outline-none sm:text-3xl lg:text-5xl">Wrap-up</h2>
        <p className="text-lg text-muted-foreground">
          {summary.visited} of {summary.total} {summary.total === 1 ? 'Rock' : 'Rocks'} looked at.
        </p>
      </header>

      {summary.unresolved.length > 0 && (
        <section role="alert" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <h3 className="flex items-center gap-2 text-base font-semibold text-amber-900 dark:text-amber-200">
            <CircleAlert className="h-5 w-5" aria-hidden />
            Stuck or late, and nothing raised for IDS
          </h3>
          <ul className="space-y-2">
            {summary.unresolved.map(title => (
              <li key={title} className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-words text-base">{title}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => onGoTo(title)}>Go back to it</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Group icon={MessageSquareWarning} title="Raised for IDS" items={summary.raised} tone="text-primary" />
      <Group icon={Pencil} title="Status changed" items={summary.changed} />
      <Group icon={CheckCircle2} title="Confirmed" items={summary.confirmed} tone="text-green-700 dark:text-green-400" />
      <Group icon={CircleAlert} title="Not reached" items={summary.unvisited} tone="text-muted-foreground" />

      {summary.visited === 0 && <p className="text-base text-muted-foreground">Nothing was confirmed, changed or raised.</p>}

      <Button type="button" className="h-12 px-8 text-base" onClick={onClose}>Back to the meeting</Button>
    </section>
  );
}
