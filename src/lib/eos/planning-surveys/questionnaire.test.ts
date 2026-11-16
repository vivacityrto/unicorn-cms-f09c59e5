import { describe, expect, it } from 'vitest';
import { emptyPlanningAnswers, parsePlanningAnswers, planningCampaignKey, PLANNING_QUESTIONS } from './questionnaire';

describe('planning survey questionnaire boundary', () => {
  it('keeps business/year separate', () => {
    expect(planningCampaignKey('vivacity', 2027)).not.toBe(planningCampaignKey('complyhub', 2027));
    expect(planningCampaignKey('vivacity', 2027)).not.toBe(planningCampaignKey('vivacity', 2028));
    expect(() => planningCampaignKey('vivacity', NaN)).toThrow();
  });
  it('uses independent answer objects', () => {
    const first = emptyPlanningAnswers();
    first.strengths = 'Changed';
    expect(emptyPlanningAnswers().strengths).toBe('');
  });
  it('allowlists answers rather than spreading identity, metadata or tokens', () => {
    const parsed = parsePlanningAnswers({ strengths: ' Useful ', user_id: 'canary', email: 'canary@example.test', token: 'secret', created_at: 'now' });
    expect(parsed.strengths).toBe('Useful');
    expect(Object.keys(parsed)).toEqual(PLANNING_QUESTIONS.map(q => q.id));
    expect(JSON.stringify(parsed)).not.toContain('canary');
  });
  it('rejects invalid and excessive inputs with generic errors', () => {
    for (const input of [null, [], 'secret', { strengths: { email: 'secret' } }, { strengths: 'x'.repeat(3001) }]) {
      expect(() => parsePlanningAnswers(input)).toThrow();
    }
  });
  it('does not claim to anonymise identifying free text', () => {
    expect(parsePlanningAnswers({ strengths: 'I am Jane' }).strengths).toBe('I am Jane');
  });
  it('does not collect NPS or employment demographics', () => {
    expect(PLANNING_QUESTIONS.map(q => q.id)).toEqual(['strengths', 'weaknesses', 'opportunities', 'threats', 'start', 'stop', 'keep', 'priority']);
  });
});
