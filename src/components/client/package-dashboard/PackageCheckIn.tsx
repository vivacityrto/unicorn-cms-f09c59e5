import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, Flag, HeartPulse, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePackageCheckinState, useSubmitCheckin } from "@/hooks/use-package-checkin";
import {
  BLOCKER_CATEGORIES,
  BLOCKER_STATUS_LABEL,
  COMMENT_LIMIT,
  CONFIDENCE_LABELS,
  PULSE_LABELS,
  checkinErrorMessage,
  scoresOf,
  trendSentence,
  type BlockerCategory,
} from "./checkins";

/** Five tap targets, 1 to 5, each with its word, so the answer is one tap and never colour alone. */
function Scale({ labels, value, onPick, name }: { labels: Record<number, string>; value: number | null; onPick: (n: number) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onPick(n)}
          className={cn(
            "flex flex-col items-center gap-0.5 rounded-lg border bg-card px-1 py-2 text-center transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === n && "border-primary bg-primary/10 ring-2 ring-primary/30",
          )}
        >
          <span className="text-lg font-bold tabular-nums">{n}</span>
          <span className="text-[11px] leading-tight text-muted-foreground">{labels[n]}</span>
        </button>
      ))}
    </div>
  );
}

function Trend({ scores, label }: { scores: number[]; label: string }) {
  if (scores.length === 0) return null;
  return (
    <div className="flex items-end gap-1" role="img" aria-label={`${label}: ${scores.join(", ")} out of 5`}>
      {scores.map((s, i) => (
        <span key={i} className="w-3 rounded-sm bg-primary/70" style={{ height: `${s * 5 + 4}px` }} title={`${s} out of 5`} />
      ))}
    </div>
  );
}

function CommentBox({ value, onChange, label, required = false }: { value: string; onChange: (v: string) => void; label: string; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, COMMENT_LIMIT))}
        rows={2}
        required={required}
        className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="mt-0.5 block text-right text-[11px] tabular-nums text-muted-foreground">{value.length}/{COMMENT_LIMIT}</span>
    </label>
  );
}

/**
 * A short check-in on the package page: a two-weekly pulse (one tap, optional note), a weekly confidence rating, and a
 * flag for anything blocking progress. It shows nothing for anyone who is not a full-access client user (staff
 * previewing included). People see only their own answers; their consultant sees all of them. Answers are not scored
 * and are not sent to AI.
 */
export function PackageCheckIn({ packageInstanceId }: { packageInstanceId: number }) {
  const { data: state, isLoading, isError } = usePackageCheckinState(packageInstanceId);
  const submit = useSubmitCheckin(packageInstanceId);
  const [pulse, setPulse] = useState<number | null>(null);
  const [pulseNote, setPulseNote] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [category, setCategory] = useState<BlockerCategory | null>(null);
  const [blockerText, setBlockerText] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (isError || !state?.eligible) return null;

  const pulseScores = scoresOf(state, "pulse");
  const confidenceScores = scoresOf(state, "confidence");
  const trend = trendSentence(pulseScores);

  const send = (input: Parameters<typeof submit.mutate>[0], done: string, reset: () => void) => {
    setMessage(null);
    submit.mutate(input, {
      onSuccess: () => {
        setMessage({ tone: "ok", text: done });
        reset();
      },
      onError: (e) => setMessage({ tone: "error", text: checkinErrorMessage(e instanceof Error ? e.message : String(e)) }),
    });
  };

  return (
    <section aria-label="Check-in" className="rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><HeartPulse className="h-4 w-4 text-primary" aria-hidden /> How is this package going for you?</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Your answers go to your Vivacity consultant so they can help early. Only you and your consultant see them.</p>

      <div className="mt-3 space-y-4">
        {state.pulse_due ? (
          <div className="space-y-3">
            <Scale labels={PULSE_LABELS} value={pulse} onPick={setPulse} name="How is this package going for you, from 1 to 5" />
            {pulse !== null && (
              <>
                <CommentBox value={pulseNote} onChange={setPulseNote} label="Anything you would like your consultant to know? (optional)" />
                <Button size="sm" disabled={submit.isPending} onClick={() => send({ kind: "pulse", score: pulse, comment: pulseNote }, "Thank you. Your consultant has your answer.", () => { setPulse(null); setPulseNote(""); })}>
                  {submit.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />}Send
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />Thanks for your check-in.{state.next_pulse_on ? ` The next one is on ${format(parseISO(state.next_pulse_on), "d MMMM")}.` : ""}</p>
            <Trend scores={pulseScores} label="Your pulse answers" />
          </div>
        )}
        {!state.pulse_due && trend && <p className="text-xs text-muted-foreground">{trend}</p>}

        {state.confidence_due && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">How confident are you about your next audit?</p>
            <Scale labels={CONFIDENCE_LABELS} value={confidence} onPick={(n) => { setConfidence(n); send({ kind: "confidence", score: n }, "Thank you. Your confidence rating is saved.", () => setConfidence(null)); }} name="Confidence about your next audit, from 1 to 5" />
          </div>
        )}
        {!state.confidence_due && confidenceScores.length > 1 && (
          <div className="flex items-center gap-3 border-t pt-3 text-xs text-muted-foreground"><span>Your audit confidence</span><Trend scores={confidenceScores} label="Your confidence ratings" /></div>
        )}

        <div className="border-t pt-3">
          {!flagging ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFlagging(true)}>
              <Flag className="h-3.5 w-3.5" aria-hidden /> Something is blocking me
            </Button>
          ) : (
            <div className="space-y-3" role="group" aria-label="Tell us what is blocking you">
              <p className="text-sm font-medium">What is getting in the way?</p>
              <div className="flex flex-wrap gap-2">
                {BLOCKER_CATEGORIES.map((c) => (
                  <button key={c.value} type="button" aria-pressed={category === c.value} title={c.hint} onClick={() => setCategory(c.value)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", category === c.value && "border-primary bg-primary/10")}>
                    {c.label}
                  </button>
                ))}
              </div>
              <CommentBox value={blockerText} onChange={setBlockerText} label="A little detail, so your consultant can help" required />
              <div className="flex gap-2">
                <Button size="sm" disabled={!category || blockerText.trim().length < 3 || submit.isPending} onClick={() => category && send({ kind: "blocker", category, comment: blockerText }, "Thank you. Your consultant will follow up.", () => { setFlagging(false); setCategory(null); setBlockerText(""); })}>
                  {submit.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />}Send to my consultant
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFlagging(false)}>Cancel</Button>
              </div>
            </div>
          )}
          {!flagging && (state.my_blockers ?? []).length > 0 && (
            <ul className="mt-3 space-y-2" aria-label="What you have flagged in the last 30 days">
              {(state.my_blockers ?? []).map((b, i) => (
                <li key={`${b.created_at}-${i}`} className="rounded-md border bg-background p-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{BLOCKER_CATEGORIES.find((c) => c.value === b.category)?.label ?? "Something else"}</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", b.status === "resolved" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : b.status === "seen" ? "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-muted-foreground")}>{BLOCKER_STATUS_LABEL[b.status]}</span>
                    <span className="text-xs text-muted-foreground">{format(parseISO(b.created_at), "d MMM")}</span>
                  </div>
                  {/* Written by Vivacity staff for this client. */}
                  {b.staff_note && <p className="mt-1 break-words text-xs text-muted-foreground"><span className="font-medium text-foreground">From your consultant: </span>{b.staff_note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div aria-live="polite" className="mt-3">
        {message && <p role={message.tone === "error" ? "alert" : "status"} className={cn("text-sm", message.tone === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>{message.text}</p>}
      </div>
    </section>
  );
}
