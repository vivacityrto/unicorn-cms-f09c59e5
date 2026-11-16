import { parseAnonymousSubmissionEnvelope, type CampaignContext, type ValidatedSubmission } from './anonymous-planning-survey.ts';
export type CollectionCampaign = CampaignContext & { keyHash: string; collectionApproved: boolean };
export type CollectorDependencies = {
  enabled: boolean;
  allowedOrigins: Set<string>;
  findCampaign: (id: string) => Promise<CollectionCampaign | null>;
  verifyKey: (key: string, expectedHash: string) => Promise<boolean>;
  accept: (submission: ValidatedSubmission, keyHash: string) => Promise<boolean>;
  now: () => number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[0-9a-f]{64}$/;
const MAX_BYTES = 100000; // Eight 3,000-character answers may use multibyte UTF-8.

async function readBoundedJson(req: Request): Promise<unknown> {
  if (!req.body) throw new Error('Invalid');
  const reader = req.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) { await reader.cancel(); throw new Error('Invalid'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Capability-authenticated, identity-free application endpoint. No logs or telemetry. */
export function createPlanningSurveyCollector(deps: CollectorDependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', Vary: 'Origin',
    };
    const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
    if (!deps.enabled) return reply(503, { error: 'Survey collection is unavailable.' });
    if (!origin || !deps.allowedOrigins.has(origin)) return reply(403, { error: 'Request not accepted.' });
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'content-type';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    // Never accept a logged-in session, cookies or tracking parameters alongside answers.
    if (req.method !== 'POST' || req.headers.has('Authorization') || req.headers.has('Cookie')
      || new URL(req.url).search || !req.headers.get('Content-Type')?.startsWith('application/json')) {
      return reply(400, { error: 'Request not accepted.' });
    }
    try {
      const data = await readBoundedJson(req);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid');
      const body = data as Record<string, unknown>;
      const keys = Object.keys(body);
      const submit = Object.hasOwn(body, 'submission');
      if (keys.length !== (submit ? 3 : 2) || !keys.every(k => ['campaignId', 'key', 'submission'].includes(k))
        || typeof body.campaignId !== 'string' || !UUID.test(body.campaignId)
        || typeof body.key !== 'string' || !KEY.test(body.key)) throw new Error('Invalid');
      const campaign = await deps.findCampaign(body.campaignId);
      if (!campaign || !campaign.collectionApproved || !await deps.verifyKey(body.key, campaign.keyHash)) {
        return reply(403, { error: 'Survey link is unavailable.' });
      }
      const now = deps.now();
      if (!submit && (campaign.state !== 'open' || !Number.isFinite(now) || !Number.isFinite(campaign.opensAtMs)
        || !Number.isFinite(campaign.closesAtMs) || now < campaign.opensAtMs || now >= campaign.closesAtMs)) {
        return reply(403, { error: 'Survey link is unavailable.' });
      }
      if (!submit) return reply(200, { campaign: {
        id: campaign.id, business: campaign.business, year: campaign.year,
        questionnaireVersion: campaign.questionnaireVersion,
      } });
      const submission = parseAnonymousSubmissionEnvelope(body.submission, campaign);
      if (!await deps.accept(submission, campaign.keyHash)) return reply(409, { error: 'Submission is not accepted.' });
      return reply(200, { accepted: true }); // No counts, timestamps, answer IDs or other responses.
    } catch {
      // Intentionally never log request, exception or DB detail: it can contain answers/key.
      return reply(400, { error: 'Submission is not accepted. Please keep this page open before retrying.' });
    }
  };
}
