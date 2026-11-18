import { useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

export interface DrillStep {
  key: string;
  label: string;
}

interface DrillCardProps<S extends DrillStep> {
  title: string;
  hint?: string;
  /** The card as it normally is. `open` slides a mini page in over it. */
  root: (open: (step: S) => void) => ReactNode;
  /** The mini page for one step. It can open another step, which stacks on top. */
  page: (step: S, open: (step: S) => void) => ReactNode;
}

/**
 * A card that can go one level deeper without leaving the card. Choosing a row slides a mini page in from the right,
 * in the same place; Back slides to the one before. Every step keeps its place in a trail, so the person always knows
 * where they are. Motion is switched off for people who ask their device for less of it.
 */
export function DrillCard<S extends DrillStep>({ title, hint, root, page }: DrillCardProps<S>) {
  const [trail, setTrail] = useState<S[]>([]);
  const current = trail[trail.length - 1];
  const parent = trail.length > 1 ? trail[trail.length - 2].label : title;
  const open = (step: S) => setTrail((t) => [...t, step]);
  const back = () => setTrail((t) => t.slice(0, -1));

  return (
    <section aria-label={title} className="space-y-3 overflow-hidden rounded-xl border bg-card p-4">
      {current ? (
        <div key={current.key} className="space-y-3 duration-200 animate-in fade-in slide-in-from-right-6 motion-reduce:animate-none">
          <nav aria-label="Where you are" className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={back}
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back to {parent}
            </button>
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {[title, ...trail.map((s) => s.label)].join(' › ')}
            </p>
          </nav>
          {page(current, open)}
        </div>
      ) : (
        <div className="space-y-2 duration-200 animate-in fade-in slide-in-from-left-6 motion-reduce:animate-none">
          <div>
            <h3 className="text-base font-bold">{title}</h3>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          </div>
          {root(open)}
        </div>
      )}
    </section>
  );
}
