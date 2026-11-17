import { parsePlanningAnswers, type PlanningAnswers, type PlanningBusiness } from '@/lib/eos/planning-surveys/questionnaire';
export type SurveyLink = { campaignId: string; key: string };
export type PublicCampaign = { id: string; business: PlanningBusiness; year: number; questionnaireVersion: string };
export type Ballot = { campaignId: string; questionnaireVersion: string; idempotencyKey: string; answers: PlanningAnswers };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseSurveyLink(hash: string): SurveyLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if ([...params.keys()].length !== 2 || params.getAll('campaign').length !== 1 || params.getAll('key').length !== 1) return null;
  const campaignId = params.get('campaign') ?? ''; const key = params.get('key') ?? '';
  return UUID.test(campaignId) && /^[a-f0-9]{64}$/.test(key) ? { campaignId, key } : null;
}

/** Never use the app's Supabase client: it automatically attaches a user JWT. */
export function createAnonymousTransport(endpoint: string, fetcher: typeof fetch = fetch) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) throw Error('Survey unavailable.');
  const send = async (body: object): Promise<Record<string, unknown>> => {
    const response = await fetcher(url.toString(), {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) throw Error('The survey request could not be confirmed.');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Survey unavailable.');
    return data as Record<string, unknown>;
  };
  return {
    async load(link: SurveyLink): Promise<PublicCampaign> {
      const data = await send(link); const c = data.campaign;
      if (!c || typeof c !== 'object' || Array.isArray(c)) throw Error('Survey unavailable.');
      const value = c as Record<string,unknown>;
      if (value.id !== link.campaignId || !['vivacity','complyhub'].includes(String(value.business))
        || !Number.isInteger(value.year) || Number(value.year) < 2027 || Number(value.year) > 2100
        || typeof value.questionnaireVersion !== 'string') throw Error('Survey unavailable.');
      return { id: link.campaignId, business: value.business as PlanningBusiness, year: Number(value.year), questionnaireVersion: value.questionnaireVersion };
    },
    async submit(link: SurveyLink, ballot: Ballot): Promise<void> {
      // Construct explicit fields; do not spread auth, analytics or account metadata.
      const submission: Ballot = { campaignId: ballot.campaignId, questionnaireVersion: ballot.questionnaireVersion,
        idempotencyKey: ballot.idempotencyKey, answers: parsePlanningAnswers(ballot.answers) };
      if (submission.campaignId !== link.campaignId) throw Error('Survey unavailable.');
      const result = await send({ campaignId: link.campaignId, key: link.key, submission });
      if (result.accepted !== true) throw Error('Submission could not be confirmed.');
    },
  };
}
