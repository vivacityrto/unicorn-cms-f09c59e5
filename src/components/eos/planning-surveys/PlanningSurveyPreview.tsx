import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  BUSINESS_LABELS, MAX_ANSWER_LENGTH, PLANNING_QUESTIONS,
  emptyPlanningAnswers, planningCampaignKey,
  type PlanningBusiness,
} from '@/lib/eos/planning-surveys/questionnaire';

type Props = { business: PlanningBusiness; year?: number };

/**
 * Unmounted review-only slice. Deliberately no submit callback, auth imports,
 * network, analytics, browser storage or account-linked save/resume.
 * Do not mount in production until the anonymous collection release gates pass.
 */
export function PlanningSurveyPreview({ business, year = 2027 }: Props) {
  // A context change remounts the form so answers never cross business/year.
  return <PreviewForm key={planningCampaignKey(business, year)} business={business} year={year} />;
}

function PreviewForm({ business, year = 2027 }: Props) {
  const [answers, setAnswers] = useState(emptyPlanningAnswers);
  const [reviewing, setReviewing] = useState(false);
  const answered = PLANNING_QUESTIONS.filter(({ id }) => answers[id].trim()).length;

  return (
    <section className="mx-auto max-w-3xl space-y-6 p-4" aria-labelledby="planning-survey-heading">
      <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
        Design preview only. Do not enter real feedback. Nothing is saved or submitted.
        Anonymous collection is not yet available or verified.
      </div>
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">EOS · Strategic Planning · {year}</p>
        <h1 id="planning-survey-heading" className="text-2xl font-bold">Help shape {BUSINESS_LABELS[business]}’s {year} plan</h1>
        <p>Help us understand what matters to our clients and team. Your ideas will inform Mission Control and our four quarterly Flight Plans. They will not automatically become Rocks or tasks.</p>
        <p>Focus on the business shown above. Skip questions you cannot comment on. Please do not include your name, role, client names or details that could identify you or someone else. Free text can reveal identity even when names are not collected.</p>
        <p className="text-sm text-muted-foreground">Preview responses stay in this screen’s memory only and are lost when you leave or change business.</p>
      </header>
      <p aria-live="polite">{answered} of {PLANNING_QUESTIONS.length} questions answered</p>
      {reviewing ? (
        <div className="space-y-5">
          <h2 className="text-xl font-semibold">Review your sample answers</h2>
          {PLANNING_QUESTIONS.map(({ id, title }) => (
            <section key={id}>
              <h3 className="font-semibold">{title}</h3>
              <p className="whitespace-pre-wrap break-words">{answers[id].trim() || 'Not answered'}</p>
            </section>
          ))}
          <Button type="button" onClick={() => setReviewing(false)}>Back to questions</Button>
          <p>Submission is disabled until anonymous collection has passed privacy and access checks.</p>
          <Button type="button" disabled>Submit unavailable in preview</Button>
        </div>
      ) : (
        <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); setReviewing(true); }}>
          {PLANNING_QUESTIONS.map(({ id, section, title, prompt, hint }) => (
            <div key={id} className="space-y-2">
              <p className="text-sm text-muted-foreground">{section}</p>
              <label className="block font-semibold" htmlFor={`planning-${id}`}>{title}: {prompt}</label>
              <p id={`planning-${id}-hint`} className="text-sm text-muted-foreground">{hint} Optional.</p>
              <Textarea id={`planning-${id}`} aria-describedby={`planning-${id}-hint`} maxLength={MAX_ANSWER_LENGTH}
                value={answers[id]} onChange={(event) => setAnswers({ ...answers, [id]: event.target.value })} />
            </div>
          ))}
          <Button type="submit">Review sample answers</Button>
          <Button type="button" variant="outline" className="ml-3" onClick={() => setAnswers(emptyPlanningAnswers())}>Clear sample answers</Button>
        </form>
      )}
    </section>
  );
}
