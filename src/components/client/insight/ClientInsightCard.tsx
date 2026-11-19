import { formatDistanceToNow, parseISO } from "date-fns";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClientInsight, type ClientInsight, type InsightSurface } from "@/hooks/use-client-insight";
import { InsightError } from "@/hooks/use-client-insight";

const COPY: Record<InsightSurface, string> = {
  home: "A short written read of your packages and what needs you.",
  packages: "A short written read of how your package is going.",
  academy: "A short written read of how your team is getting on in the Academy.",
};

const ago = (iso: string) => {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "just now";
  }
};

/** Plain words for a failure, never a code or a stack trace. */
export function insightErrorMessage(error: InsightError): string {
  switch (error.code) {
    case "NOT_ENABLED":
      return "Viv summaries are not switched on for your account yet.";
    case "DAILY_LIMIT_REACHED":
      return "You have reached today's limit for Viv. It resets tomorrow.";
    case "NOT_AVAILABLE":
      return "These figures are only available to your organisation's main contacts.";
    case "BUSY":
    case "UNAVAILABLE":
      return "Viv is busy right now. Please try again in a minute.";
    default:
      return "Viv could not write a summary this time. Please try again.";
  }
}

/** The result, separate from the hook so it can be read and tested on its own. */
export function InsightResult({ insight }: { insight: ClientInsight }) {
  const s = insight.summary;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">{s.headline}</p>
      <ul className="space-y-1.5 text-sm text-foreground">
        {s.points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      {s.next_step && (
        <p className="rounded-lg border border-primary/30 bg-background p-2.5 text-sm">
          <span className="font-semibold">A good next step: </span>
          {s.next_step}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Written by AI from your figures {ago(insight.generated_at)}. Check anything important with your consultant.</p>
    </div>
  );
}

/**
 * Viv's insight: a short AI-written read of the figures on the page, written only when the person presses the button
 * (the always-on "At a glance" cards are plain calculations and cost nothing). A result is kept for 30 minutes.
 */
export function ClientInsightCard({ surface }: { surface: InsightSurface }) {
  const { insight, isLoading, error, available, ask } = useClientInsight(surface);
  if (!available) return null;
  const blocked = error?.code === "NOT_ENABLED" || error?.code === "DAILY_LIMIT_REACHED";
  return (
    <section aria-label="Viv's insight" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Viv's insight
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{COPY[surface]} It only runs when you ask.</p>
        </div>
        <Button size="sm" variant={insight ? "outline" : "default"} onClick={() => void ask()} disabled={isLoading || blocked} className="shrink-0 gap-1.5">
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : insight ? <RefreshCw className="h-3.5 w-3.5" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          {isLoading ? "Writing…" : insight ? "Refresh" : "Ask Viv for an insight"}
        </Button>
      </div>
      <div className="mt-3" aria-live="polite">
        {error && !isLoading && <p role="alert" className="text-sm text-muted-foreground">{insightErrorMessage(error)}</p>}
        {insight && <InsightResult insight={insight} />}
      </div>
    </section>
  );
}
