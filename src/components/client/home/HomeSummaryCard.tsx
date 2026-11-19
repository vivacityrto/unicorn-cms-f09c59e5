import { Sparkles } from 'lucide-react';

/**
 * A short plain-language read of where things stand, written from the numbers on the page. It has the same section
 * heading as the column beside it ("Your packages"), above the card, so the two cards start on the same line.
 */
export function HomeSummaryCard({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section aria-label="At a glance" className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden /> At a glance
      </h2>
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <ul className="space-y-1.5 text-sm text-foreground">
          {lines.map((l) => (
            <li key={l} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
