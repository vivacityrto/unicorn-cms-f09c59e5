import { Sparkles } from 'lucide-react';

/** A short plain-language read of where things stand, written from the numbers on the page. */
export function HomeSummaryCard({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section aria-label="At a glance" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden /> At a glance
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm text-foreground">
        {lines.map((l) => (
          <li key={l} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
