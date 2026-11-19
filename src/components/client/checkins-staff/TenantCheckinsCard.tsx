import { useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { AlertTriangle, Flag, HeartPulse, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTenantCheckins } from "@/hooks/use-tenant-checkins";
import { useSetBlockerStatus, type BlockerAction } from "@/hooks/use-set-blocker-status";
import { categoryLabel, daysSinceLastPulse, hasLowStreak, packageFlags, summariseOverview, type StaffBlocker, type TenantCheckinsOverview } from "./tenantCheckins";

type Pkg = TenantCheckinsOverview["packages"][number];

const ago = (iso: string) => {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "recently";
  }
};

function PulseBars({ scores, name }: { scores: number[]; name: string }) {
  return (
    <div className="flex items-end gap-1" role="img" aria-label={`${name}'s recent pulse answers: ${scores.join(", ")} out of 5`}>
      {scores.map((s, i) => (
        <span key={i} className={cn("w-3 rounded-sm", s <= 2 ? "bg-amber-500" : "bg-primary/70")} style={{ height: `${s * 5 + 4}px` }} title={`${s} out of 5`} />
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<StaffBlocker["status"], string> = { flagged: "New", seen: "Seen", resolved: "Resolved" };

/** One blocker, with where it stands and the actions to move it on. A note, if left, is shown to the client. */
function BlockerRow({ b }: { b: StaffBlocker }) {
  const set = useSetBlockerStatus();
  const [action, setAction] = useState<Exclude<BlockerAction, "reopen"> | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (a: BlockerAction, n?: string) => {
    setError(null);
    set.mutate({ id: b.id, action: a, note: n }, {
      onSuccess: () => { setAction(null); setNote(""); },
      onError: (e) => setError(e instanceof Error ? e.message : "Could not update this blocker."),
    });
  };

  return (
    <li className={cn("rounded-md border p-2.5 text-sm", b.status === "resolved" ? "bg-muted/40 opacity-80" : "border-amber-500/30 bg-amber-500/10")}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{categoryLabel(b.category)}</Badge>
        <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", b.status === "flagged" && "border-amber-500/50 text-amber-800 dark:text-amber-300")}>{STATUS_LABEL[b.status]}</Badge>
        <span>{b.name}</span>
        <span>· {ago(b.created_at)}</span>
        {b.status !== "flagged" && b.seen_by && <span>· seen by {b.seen_by}</span>}
      </div>
      {/* Written by the client. Rendered as plain text. */}
      {b.comment && <p className="mt-1 whitespace-pre-wrap break-words text-foreground">{b.comment}</p>}
      {b.staff_note && <p className="mt-1 break-words text-xs text-muted-foreground"><span className="font-medium text-foreground">Note the client can see: </span>{b.staff_note}</p>}

      {action ? (
        <div className="mt-2 space-y-2" role="group" aria-label={action === "resolve" ? "Resolve this blocker" : "Mark this blocker seen"}>
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Note for the client (optional). They will see this, so keep it to what you want them to know.</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} rows={2} className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={set.isPending} onClick={() => run(action === "resolve" ? "resolve" : "acknowledge", note)}>
              {set.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />}{action === "resolve" ? "Resolve" : "Mark seen"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAction(null); setNote(""); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {b.status === "flagged" && <Button size="sm" variant="outline" onClick={() => setAction("acknowledge")}>Mark seen</Button>}
          {b.status !== "resolved" && <Button size="sm" variant="outline" onClick={() => setAction("resolve")}>Resolve</Button>}
          {b.status === "resolved" && <Button size="sm" variant="outline" disabled={set.isPending} onClick={() => run("reopen")}>Reopen</Button>}
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </li>
  );
}

function PackageBlock({ pkg }: { pkg: Pkg }) {
  const flags = packageFlags(pkg);
  return (
    <section aria-label={`Check-ins for ${pkg.package_name}`} className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{pkg.package_name}</h3>
        {flags.blockerCount > 0 && <Badge variant="outline" className="border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300"><Flag className="mr-1 h-3 w-3" aria-hidden />{flags.blockerCount} {flags.blockerCount === 1 ? "blocker" : "blockers"}</Badge>}
        {flags.lowStreakNames.length > 0 && <Badge variant="outline" className="border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300"><AlertTriangle className="mr-1 h-3 w-3" aria-hidden />Two low pulses in a row</Badge>}
        {flags.noAnswers && <Badge variant="outline" className="text-muted-foreground">No check-ins yet</Badge>}
      </div>

      {pkg.people.length > 0 && (
        <ul className="mt-3 space-y-2">
          {pkg.people.map((p) => {
            const scores = (p.pulses ?? []).map((x) => x.score);
            const days = daysSinceLastPulse(p);
            return (
              <li key={p.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)]">
                <span className="truncate font-medium">{p.name}{hasLowStreak(p) && <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">two low pulses</span>}</span>
                {scores.length > 0 ? <PulseBars scores={scores} name={p.name} /> : <span className="text-xs text-muted-foreground">No pulse yet</span>}
                <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1 sm:text-right">
                  {scores.length > 0 && `Pulse ${scores[scores.length - 1]}/5${days === null ? "" : days === 0 ? " today" : ` ${days}d ago`}`}
                  {p.confidence && `${scores.length > 0 ? " · " : ""}Audit confidence ${p.confidence.score}/5`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {pkg.blockers.length > 0 && (
        <ul className="mt-3 space-y-2 border-t pt-3" aria-label="Blockers flagged in the last 30 days">
          {pkg.blockers.map((b) => <BlockerRow key={b.id} b={b} />)}
        </ul>
      )}
    </section>
  );
}

/**
 * Staff view of what a client's team has said in their check-ins: each person's recent pulse and audit confidence, and
 * any blocker flagged in the last 30 days. Flags use two plain rules (a blocker, or two low pulses in a row); answers
 * are not scored and feed no health score. People with nothing recorded read as "no check-ins yet", never as fine.
 */
export function TenantCheckinsCard({ tenantId }: { tenantId: number }) {
  const { data, isLoading, isError } = useTenantCheckins(tenantId);
  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (isError || !data) {
    return (
      <Card><CardContent className="p-4 text-sm text-muted-foreground">Client check-ins could not be loaded. Refresh to try again.</CardContent></Card>
    );
  }
  const summary = summariseOverview(data);
  const attention = summary.blockers > 0 || summary.lowStreakPeople > 0;
  return (
    <Card className={cn(attention && "border-amber-500/40")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><HeartPulse className="h-4 w-4 text-primary" aria-hidden />Client check-ins</CardTitle>
        <p className="text-xs text-muted-foreground">What the client's team has told you on their packages. Answers are not scored.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={cn("text-sm", attention ? "font-medium text-amber-800 dark:text-amber-300" : "text-muted-foreground")} role={attention ? "status" : undefined}>{summary.sentence}</p>
        {data.packages.map((pkg) => <PackageBlock key={pkg.package_instance_id} pkg={pkg} />)}
      </CardContent>
    </Card>
  );
}
