import { useEffect, useRef } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Measure } from '@/features/eos-scorecard/scorecardView';
import { useScorecardInsight } from '@/features/eos-scorecard/useScorecardInsight';

interface VivInsightProps {
  measure: Measure;
  weekKey: string;
  /** Ask straight away on opening, unless there is already an answer for this week. */
  autoStart?: boolean;
}

/** Viv's plain-language read of one measure: what may be behind the number, and what to try this week. Only runs when asked. */
export function VivInsight({ measure, weekKey, autoStart = false }: VivInsightProps) {
  const { result, isAsking, error, ask } = useScorecardInsight(measure.id, weekKey);
  const started = useRef(false);
  useEffect(() => {
    if (autoStart && !started.current && !result) {
      started.current = true;
      ask();
    }
  }, [autoStart, result, ask]);

  const insight = result?.insight;
  return (
    <section aria-label="Ask Viv" aria-busy={isAsking} className="space-y-3 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          Viv’s read
        </h3>
        {insight && !isAsking && (
          <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5" onClick={ask}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Ask again
          </Button>
        )}
      </div>

      {!insight && !isAsking && !error && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Viv reads this week’s numbers and explains, in plain words, what may be behind them and what to try. It only uses the data on this page.</p>
          <Button type="button" className="gap-2" onClick={ask}>
            <Sparkles className="h-4 w-4" aria-hidden />
            Explain this number
          </Button>
        </div>
      )}

      {isAsking && (
        <div className="space-y-2" role="status">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Viv is reading the numbers. This takes a few seconds.
          </p>
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      )}

      {error && !isAsking && (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={ask}>Try again</Button>
        </div>
      )}

      {insight && !isAsking && (
        <div className="space-y-3">
          <p className="text-lg font-semibold leading-snug">{insight.headline}</p>
          {insight.why.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold">What may be behind it</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {insight.why.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          )}
          {insight.actions.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold">What to try this week</h4>
              <ol className="mt-1 space-y-2">
                {insight.actions.map((a, i) => (
                  <li key={i} className="rounded-lg border bg-card p-3 text-sm">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold">{i + 1}. {a.action}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{a.who}</span>
                    </p>
                    {a.detail && <p className="mt-1 text-muted-foreground">{a.detail}</p>}
                    {a.clients.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Start with: {a.clients.join(', ')}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {insight.watch && (
            <p className="text-sm">
              <span className="font-semibold">Keep an eye on: </span>
              {insight.watch}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Written by AI from this week’s numbers. It can be wrong, so check it against what you know before acting.</p>
        </div>
      )}
    </section>
  );
}
