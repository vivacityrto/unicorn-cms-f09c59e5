import { useEffect, useRef, useState } from 'react';
import { BUSINESS_LABELS, PLANNING_QUESTIONS, QUESTIONNAIRE_VERSION, emptyPlanningAnswers } from '@/lib/eos/planning-surveys/questionnaire';
import { createAnonymousTransport, type Ballot, type PublicCampaign, type SurveyLink } from './transport';

type Props = { link: SurveyLink | null; enabled: boolean; endpoint: string };
export function AnonymousPlanningSurvey({ link, enabled, endpoint }: Props) {
  const [campaign,setCampaign] = useState<PublicCampaign | null>(null);
  const [answers,setAnswers] = useState(emptyPlanningAnswers);
  const [review,setReview] = useState(false);
  const [consent,setConsent] = useState(false);
  const [busy,setBusy] = useState(false);
  const [sent,setSent] = useState(false);
  const [error,setError] = useState('');
  const pending = useRef<Ballot | null>(null);
  useEffect(() => {
    if (!enabled || !link) return;
    let active = true;
    const load = async () => {
      try {
        const result = await createAnonymousTransport(endpoint).load(link);
        if (result.questionnaireVersion !== QUESTIONNAIRE_VERSION) throw Error('Unsupported questionnaire');
        if (active) setCampaign(result);
      } catch { if (active) setError('This survey link is unavailable or collection has closed.'); }
    };
    void load(); return () => { active = false; };
  }, [enabled,endpoint,link]);
  const submit = async () => {
    if (!campaign || !link || busy || sent || !consent) return;
    setBusy(true); setError('');
    // A failed/uncertain request always retries the exact same ballot and random key.
    pending.current ??= { campaignId: campaign.id, questionnaireVersion: campaign.questionnaireVersion,
      idempotencyKey: crypto.randomUUID(), answers: { ...answers } };
    try {
      await createAnonymousTransport(endpoint).submit(link,pending.current);
      setSent(true); setAnswers(emptyPlanningAnswers()); pending.current=null;
    } catch { setError('We could not confirm receipt. Keep this page open and retry the same submission. Do not start another response.'); }
    finally { setBusy(false); }
  };
  return <main className="survey">
    {!enabled ? <h1>Survey collection is not open yet</h1> : !link ? <h1>Please use the complete survey link from your invitation</h1> : !campaign ? <h1>Opening your survey…</h1> : sent ? <>
      <h1>Thank you. Your response has been received.</h1><p>Your feedback will help shape {BUSINESS_LABELS[campaign.business]}’s {campaign.year} plan. You can close this page.</p>
    </> : <>
      <p>EOS · Strategic planning · {campaign.year}</p><h1>Help shape {BUSINESS_LABELS[campaign.business]}’s future</h1>
      <p>Your feedback will inform Mission Control and four quarterly Flight Plans. Suggestions do not automatically become Rocks or tasks.</p>
      <aside><h2>Before you begin</h2><p>This shared survey does not ask for your name or sign-in. Do not include your name, role, client names or details that identify anyone. Free text and small groups can still reveal who wrote an answer. Technical hosting providers may retain network metadata.</p>
      <p>Please submit once for this business. We cannot track who has completed this survey or prevent a person submitting again. Answers stay in this screen until you submit and are lost if you close or refresh it. There is no saved draft or personal response history.</p></aside>
      <p>All questions are optional. Answer at least one. Aim for up to three ideas per section.</p>
      {review ? <section><h2>Review your answers</h2>{PLANNING_QUESTIONS.map(q=><section key={q.id}><h3>{q.title}</h3><p className="answer">{answers[q.id].trim() || 'Not answered'}</p></section>)}
        <label className="acknowledgment"><input type="checkbox" checked={consent} disabled={busy || !!pending.current} onChange={e=>setConsent(e.target.checked)} /> I have reviewed my answers for identifying details and understand the privacy information above.</label>
        <div className="actions"><button onClick={()=>void submit()} disabled={busy || !consent}>{busy ? 'Sending…' : pending.current ? 'Retry same submission' : 'Submit feedback'}</button>
        <button disabled={busy || !!pending.current} onClick={()=>setReview(false)}>Back to questions</button></div>
      </section> : <form onSubmit={e=>{e.preventDefault();if(Object.values(answers).some(a=>a.trim()))setReview(true);else setError('Please answer at least one question.');}}>
        {PLANNING_QUESTIONS.map(q=><section key={q.id}><p>{q.section}</p><label htmlFor={q.id}><strong>{q.title}</strong>: {q.prompt}</label><p id={`${q.id}-hint`}>{q.hint}</p><textarea id={q.id} aria-describedby={`${q.id}-hint`} value={answers[q.id]} maxLength={3000} onChange={e=>setAnswers({...answers,[q.id]:e.target.value})} /></section>)}
        <button type="submit">Review answers</button>
      </form>}
    </>}
    {error && <p role="alert">{error}</p>}
  </main>;
}
