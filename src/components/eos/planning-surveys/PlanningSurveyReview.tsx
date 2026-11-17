import { useState } from 'react';
import { BUSINESS_LABELS, PLANNING_QUESTIONS } from '@/lib/eos/planning-surveys/questionnaire';
import { parsePlanningReview, type PlanningReview } from '@/lib/eos/planning-surveys/review';

type Gateway = { review: (campaignId: string) => Promise<unknown>; close: (campaignId: string) => Promise<void> };
type Props = { campaignId: string; gateway: Gateway };
/** Default-off routed draft. Gateway MUST enforce assignment, closed state and privacy gates server-side. */
export function PlanningSurveyReview({ campaignId, gateway }: Props) {
  return <Review key={campaignId} campaignId={campaignId} gateway={gateway} />;
}
function Review({ campaignId, gateway }: Props) {
  const [result, setResult] = useState<PlanningReview | null>(null);
  const [message, setMessage] = useState('Results have not been requested.');
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Do not fetch raw answers on mount. Never persist them or send them to AI.
  async function load() {
    setBusy(true); setResult(null);
    try {
      const next = parsePlanningReview(await gateway.review(campaignId));
      if (next.campaignId !== campaignId) throw new Error('Wrong campaign');
      setResult(next); setMessage('Restricted review. Do not share identifiable quotations.');
    } catch { setMessage('Results unavailable. Collection may still be open, the privacy threshold unmet, or your access not approved.'); }
    finally { setBusy(false); }
  }
  async function close() {
    if (!confirmClose) return;
    setBusy(true); setResult(null);
    try { await gateway.close(campaignId); setConfirmClose(false); setMessage('Collection closed. This does not publish or release responses.'); }
    catch { setMessage('Closure could not be confirmed. Check status before retrying.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5 p-4" aria-labelledby="planning-review-title">
    <h1 id="planning-review-title">Strategic planning: restricted review</h1>
    <p>Draft review tool. Access must be separately approved. Responses are not verified unique people. Free text may reveal who wrote it. A submission threshold does not establish a number of distinct people.</p>
    <p>No individual completion list, early response feed, role filters, downloads or automatic Rocks.</p>
    <p role="status">{message}</p>
    <button disabled={busy} onClick={load}>Request closed-campaign results</button>
    <button disabled={busy || !result} onClick={() => { setResult(null); setMessage('Answers cleared from this view.'); }}>Clear results</button>
    <fieldset disabled={busy}>
      <legend>Close collection</legend>
      <label><input type="checkbox" checked={confirmClose} onChange={e => setConfirmClose(e.target.checked)} />I intend to stop accepting new responses for this campaign.</label>
      <button disabled={!confirmClose || busy} onClick={close}>Close collection</button>
    </fieldset>
    {result && <div>
      <h2>{BUSINESS_LABELS[result.business]} · {result.year}</h2>
      <p>{result.responseCount} responses, not a count of unique people. No submission order is shown.</p>
      {PLANNING_QUESTIONS.map(({ id, title }) => <section key={id}>
        <h3>{title}</h3>
        {result.answersByQuestion[id].length === 0 && <p>No text released for this question. It may have no answers or not meet the release threshold.</p>}
        <ul>{result.answersByQuestion[id].map((answer, index) => answer.trim() && <li key={index} className="whitespace-pre-wrap break-words">{answer}</li>)}</ul>
      </section>)}
      <p>Prepare non-identifying themes for planning. Creating or changing Mission Control, Flight Plans or Rocks is a separate deliberate action.</p>
    </div>}
  </section>;
}
