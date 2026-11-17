import { PLANNING_QUESTIONS, type PlanningBusiness } from './questionnaire';

export type PlanningReview = {
  campaignId: string; business: PlanningBusiness; year: number;
  responseCount: number; answersByQuestion: Record<string, string[]>;
};
/** No identities, record IDs or times are passed to the reviewer UI. */
export function parsePlanningReview(value: unknown): PlanningReview {
  if (!value || typeof value !== 'object') throw new Error('Review unavailable');
  const row = value as Record<string, unknown>;
  if (typeof row.campaignId !== 'string' || !['vivacity', 'complyhub'].includes(String(row.business))
    || !Number.isInteger(row.year) || Number(row.year) < 2027 || Number(row.year) > 2100
    || !Number.isInteger(row.responseCount) || Number(row.responseCount) < 2
    || Number(row.responseCount) > 10000 || !row.answersByQuestion || typeof row.answersByQuestion !== 'object') throw new Error('Review unavailable');
  const raw = row.answersByQuestion as Record<string, unknown>;
  const answersByQuestion: Record<string, string[]> = {};
  for (const { id } of PLANNING_QUESTIONS) {
    const items = raw[id];
    if (!Array.isArray(items) || items.length > Number(row.responseCount) || items.some(v => typeof v !== 'string' || v.length > 3000)) throw new Error('Review unavailable');
    answersByQuestion[id] = items;
  }
  return { campaignId: row.campaignId, business: row.business as PlanningBusiness, year: Number(row.year),
    responseCount: Number(row.responseCount), answersByQuestion };
}
