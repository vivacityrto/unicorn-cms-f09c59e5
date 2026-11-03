import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckCircle2, CircleDashed, Flag } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTasClientSummary, type TasSummaryAnswer } from '@/hooks/useTasClientSummary';

function displayValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const parts = [o.code, o.title].filter((x) => typeof x === 'string' && x);
    return parts.length ? parts.join(' ') : JSON.stringify(o);
  }
  return String(value);
}

function sourceLine(a: TasSummaryAnswer): string {
  if (a.source === 'client') return 'From you';
  if (a.source === 'consultant') return 'Filled in by your consultant';
  const checked = a.source_checked_at ? format(new Date(a.source_checked_at), 'd MMMM yyyy') : 'date unknown';
  return `From your training.gov.au record, last checked: ${checked}`;
}

function StatusBadge({ a }: { a: TasSummaryAnswer }) {
  if (a.removed) return <Badge variant="outline">Removed</Badge>;
  if (a.flagged) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Flag className="h-3 w-3" aria-hidden="true" />
        Needs a change
      </Badge>
    );
  }
  if (a.confirmed) {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Confirmed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <CircleDashed className="h-3 w-3" aria-hidden="true" />
      Not checked yet
    </Badge>
  );
}

/**
 * The client confirm view for a TAS intake a consultant has released: read the answers back, confirm
 * each or say it needs a change, then send it to the consultant. Reachable only by link; there is no
 * navigation entry. The client sees the released summary only, never consultant decisions or notes.
 */
export default function TasIntakePage() {
  const { intakeId } = useParams<{ intakeId: string }>();
  const { summary, loading, busy, problem, decide, submit } = useTasClientSummary(intakeId);

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  if (!summary) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            {problem === 'not_found'
              ? "We can't find that. Please check the link with your consultant."
              : 'Something went wrong. Please try again, or contact your consultant.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const open = summary.intake.status === 'in_progress' || summary.intake.status === 'returned';
  const checkable = summary.answers.filter((a) => !a.removed);
  const checked = checkable.filter((a) => a.confirmed || a.flagged).length;
  const allChecked = checkable.length > 0 && checked === checkable.length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Check your training and assessment strategy answers</h1>
        <p className="text-sm text-muted-foreground">
          {summary.intake.qualification_code}
          {summary.intake.cohort_label ? `, ${summary.intake.cohort_label}` : ''}
        </p>
      </header>

      {!open && (
        <Alert>
          <AlertDescription>
            Thank you. Your consultant has your answers and will be in touch. You can read them below.
          </AlertDescription>
        </Alert>
      )}

      {open && (
        <p className="text-sm">
          Your consultant has filled in what we already know. For each answer, confirm it if it is right, or say it
          needs a change and your consultant will talk it through with you. Please describe learner needs in general
          terms and do not enter personal details about individual learners.
        </p>
      )}

      {problem === 'conflict' && (
        <Alert variant="destructive">
          <AlertDescription>
            Someone else changed this while you were looking. We have reloaded it. Please check it again.
          </AlertDescription>
        </Alert>
      )}
      {problem === 'other' && (
        <Alert variant="destructive">
          <AlertDescription>We could not save that. Please try again.</AlertDescription>
        </Alert>
      )}

      <p className="text-sm font-medium" role="status" data-testid="tas-progress">
        {checked} of {checkable.length} answers checked
      </p>

      <ul className="space-y-3">
        {summary.answers.map((a) => (
          <li key={a.question_id}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span>{a.prompt}</span>
                  <StatusBadge a={a} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {a.removed ? (
                  <p className="text-muted-foreground">This answer was removed at your request.</p>
                ) : (
                  <>
                    <p data-testid={`tas-value-${a.question_id}`}>{displayValue(a.value) || 'No answer yet'}</p>
                    <p className="text-xs text-muted-foreground">{sourceLine(a)}</p>
                    {a.returned && (
                      <p className="text-xs">Your consultant asked you to look at this answer again.</p>
                    )}
                    {open && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={a.confirmed ? 'default' : 'outline'}
                          disabled={busy}
                          aria-label={`This is right: ${a.prompt}`}
                          onClick={() => void decide([{ question_id: a.question_id, decision: 'confirm' }])}
                        >
                          This is right
                        </Button>
                        <Button
                          size="sm"
                          variant={a.flagged ? 'default' : 'outline'}
                          disabled={busy}
                          aria-label={`This needs a change: ${a.prompt}`}
                          onClick={() => void decide([{ question_id: a.question_id, decision: 'flag' }])}
                        >
                          This needs a change
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {open && (
        <div className="space-y-1">
          <Button disabled={!allChecked || busy} onClick={() => void submit()}>
            Send to my consultant
          </Button>
          {!allChecked && (
            <p className="text-xs text-muted-foreground">
              Check every answer first. An answer marked as needing a change counts as checked.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
