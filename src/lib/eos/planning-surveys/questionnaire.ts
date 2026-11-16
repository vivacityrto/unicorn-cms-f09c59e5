/** Versioned question copy only. No participant identity or answer persistence. */
export const PLANNING_BUSINESSES = ['vivacity', 'complyhub'] as const;
export type PlanningBusiness = typeof PLANNING_BUSINESSES[number];
export const BUSINESS_LABELS: Record<PlanningBusiness, string> = {
  vivacity: 'Vivacity',
  complyhub: 'ComplyHub',
};
export const QUESTIONNAIRE_VERSION = '2027-strategy-v1';
export const MAX_ANSWER_LENGTH = 3000;

export const PLANNING_QUESTIONS = [
  { id: 'strengths', section: 'SWOT', title: 'Strengths', prompt: 'What do we do particularly well that helps our clients succeed?', hint: 'Share up to three strengths, with examples of the difference they make.' },
  { id: 'weaknesses', section: 'SWOT', title: 'Weaknesses', prompt: 'Where do our internal systems, skills or ways of working hold us back?', hint: 'Share up to three recurring gaps and their impact. Focus on processes, not identifying people.' },
  { id: 'opportunities', section: 'SWOT', title: 'Opportunities', prompt: 'Which external changes or unmet client needs should we respond to in 2027?', hint: 'Share up to three opportunities and why they matter to clients.' },
  { id: 'threats', section: 'SWOT', title: 'Threats', prompt: 'What external risks could make it harder to deliver value in 2027?', hint: 'Share up to three risks and what we should prepare for.' },
  { id: 'start', section: 'Start, Stop, Keep', title: 'Start', prompt: 'What should we start doing to solve a client problem or help the team deliver better outcomes?', hint: 'Share up to three ideas. Explain who benefits and the problem each idea solves.' },
  { id: 'stop', section: 'Start, Stop, Keep', title: 'Stop', prompt: 'What should we stop because it adds little value, creates friction or distracts us from our priorities?', hint: 'Share up to three activities. Suggest a replacement where one is needed.' },
  { id: 'keep', section: 'Start, Stop, Keep', title: 'Keep', prompt: 'What is working well that we should protect and continue?', hint: 'Share up to three practices and examples of their value.' },
  { id: 'priority', section: '2027 priorities', title: 'Your highest-impact recommendation', prompt: 'If we could make one meaningful improvement in 2027, what should it be?', hint: 'Describe the outcome, how we would measure success and any resources or dependencies.' },
] as const;
export type PlanningQuestionId = typeof PLANNING_QUESTIONS[number]['id'];
export type PlanningAnswers = Record<PlanningQuestionId, string>;

export function emptyPlanningAnswers(): PlanningAnswers {
  return Object.fromEntries(PLANNING_QUESTIONS.map(({ id }) => [id, ''])) as PlanningAnswers;
}

/** Only known answer fields survive. This does NOT anonymise identifying free text. */
export function parsePlanningAnswers(input: unknown): PlanningAnswers {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Answers must be an object.');
  }
  const answers = emptyPlanningAnswers();
  for (const { id } of PLANNING_QUESTIONS) {
    const value: unknown = Object.prototype.hasOwnProperty.call(input, id)
      ? (input as Record<string, unknown>)[id] : '';
    if (typeof value !== 'string' || value.length > MAX_ANSWER_LENGTH) {
      throw new Error('An answer is invalid or too long.');
    }
    answers[id] = value.trim();
  }
  return answers;
}

export function planningCampaignKey(business: PlanningBusiness, year: number): string {
  if (!PLANNING_BUSINESSES.includes(business) || !Number.isInteger(year) || year < 2027 || year > 2100) {
    throw new Error('Invalid planning campaign.');
  }
  return `${business}:${year}`;
}
