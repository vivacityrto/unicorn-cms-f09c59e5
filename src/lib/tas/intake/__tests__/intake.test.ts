import { describe, it, expect } from 'vitest';
import { CATALOGUE } from '../catalogue.ts';
import { clientTypeGate, evaluateCondition, evaluateIntake, starterStatus } from '../engine.ts';
import { reconcileCatalogue } from '../reconcile.ts';
import type { AnswerMap, AnswerValue } from '../types.ts';

const MARKET = 'tas.cohort.delivery_market.v1';
const MODES = 'tas.delivery.modes.v1';
const answered = (value: string | string[]): AnswerValue => ({ state: 'answered', value });
const ev = (answers: AnswerMap, clientType: 'rto' | 'cricos' = 'rto') => evaluateIntake(CATALOGUE, answers, clientType);

describe('catalogue reconciliation', () => {
  it('reconciles: 113 legacy fields each mapped once, 88 questions, 16 starter questions', () => {
    expect(reconcileCatalogue(CATALOGUE)).toEqual([]);
  });

  it('detects a legacy id mapped twice', () => {
    const bad = CATALOGUE.map((e, i) => (i === 1 ? { ...e, legacyIds: [...e.legacyIds, 'L001'] } : e));
    expect(reconcileCatalogue(bad).some((p) => p.includes('L001 mapped twice'))).toBe(true);
  });

  it('detects a legacy id with no disposition', () => {
    const bad = CATALOGUE.map((e) => ({ ...e, legacyIds: e.legacyIds.filter((id) => id !== 'L113') }));
    expect(reconcileCatalogue(bad).some((p) => p.includes('L113 has no disposition'))).toBe(true);
  });

  it('refuses real wording in the public repository (placeholders only, D19)', () => {
    const bad = CATALOGUE.map((e, i) => (i === 0 ? { ...e, placeholder: 'A real question wording' } : e));
    expect(reconcileCatalogue(bad).some((p) => p.includes('non-placeholder wording'))).toBe(true);
  });

  it('detects a dangling parent or condition reference', () => {
    const bad = CATALOGUE.map((e, i) =>
      i === 0 ? { ...e, parentKey: 'tas.nope.nothing.v1', requiresWhen: { op: 'answered', key: 'tas.nope.other.v1' } } : e,
    );
    const problems = reconcileCatalogue(bad);
    expect(problems.some((p) => p.includes('unknown parent'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown key'))).toBe(true);
  });
});

describe('condition evaluator', () => {
  const a: AnswerMap = { x: answered('b'), m: answered(['p', 'q']), s: { state: 'not_decided' } };
  it('handles each operator', () => {
    expect(evaluateCondition({ op: 'always' }, {})).toBe(true);
    expect(evaluateCondition({ op: 'answered', key: 'x' }, a)).toBe(true);
    expect(evaluateCondition({ op: 'answered', key: 's' }, a)).toBe(false);
    expect(evaluateCondition({ op: 'eq', key: 'x', value: 'b' }, a)).toBe(true);
    expect(evaluateCondition({ op: 'in', key: 'x', values: ['a', 'b'] }, a)).toBe(true);
    expect(evaluateCondition({ op: 'includes_any', key: 'm', values: ['q', 'z'] }, a)).toBe(true);
    expect(evaluateCondition({ op: 'includes_any', key: 'm', values: ['z'] }, a)).toBe(false);
    expect(evaluateCondition({ op: 'not', of: { op: 'eq', key: 'x', value: 'b' } }, a)).toBe(false);
    expect(evaluateCondition({ op: 'all', of: [{ op: 'always' }, { op: 'answered', key: 'x' }] }, a)).toBe(true);
    expect(evaluateCondition({ op: 'any', of: [{ op: 'answered', key: 'nope' }, { op: 'answered', key: 'x' }] }, a)).toBe(true);
  });
  it('treats a missing or unsettled answer as not matching', () => {
    expect(evaluateCondition({ op: 'eq', key: 'missing', value: 'b' }, {})).toBe(false);
    expect(evaluateCondition({ op: 'in', key: 's', values: ['b'] }, a)).toBe(false);
  });
});

describe('branch fixtures', () => {
  it('domestic cohort: no international branch, no National Code flag', () => {
    const r = ev({ [MARKET]: answered('domestic') });
    expect(r.applicable['tas.entry.ielts.v1']).toBe(false);
    expect(r.applicable['tas.research.origin_needs.v1']).toBe(false);
    expect(r.flags).not.toContain('national_code_review');
  });

  it.each(['international', 'both'])('%s cohort: entry and origin questions apply, consultant checks the National Code', (m) => {
    const r = ev({ [MARKET]: answered(m) });
    expect(r.applicable['tas.entry.ielts.v1']).toBe(true);
    expect(r.applicable['tas.entry.origin.v1']).toBe(true);
    expect(r.askable).toContain('tas.entry.ielts.v1');
    expect(r.flags).toContain('national_code_review');
  });

  it('unsure cohort market does not open the international branch', () => {
    expect(ev({ [MARKET]: answered('unsure') }).applicable['tas.entry.ielts.v1']).toBe(false);
  });

  it('CRICOS client type raises the National Code flag even for a domestic cohort', () => {
    expect(ev({ [MARKET]: answered('domestic') }, 'cricos').flags).toContain('national_code_review');
  });

  it('GTO clients are refused at creation', () => {
    const gate = clientTypeGate('gto');
    expect(gate.ok).toBe(false);
    expect(() => evaluateIntake(CATALOGUE, {}, 'gto')).toThrow(/National Standards for GTOs 2017/);
  });

  it.each([
    [['classroom'], { class_size: true, classroom_schedule: true, online_schedule: false, work_placement_hours: false }],
    [['online'], { class_size: false, classroom_schedule: false, online_schedule: true, work_placement_hours: false }],
    [['workplace'], { class_size: false, classroom_schedule: false, online_schedule: false, work_placement_hours: true }],
    [['blended'], { class_size: true, classroom_schedule: true, online_schedule: true, work_placement_hours: true }],
    [['not_decided'], { class_size: false, classroom_schedule: false, online_schedule: false, work_placement_hours: false }],
  ])('delivery modes %j open only the matching follow-ups', (modes, expected) => {
    const r = ev({ [MODES]: answered(modes) });
    for (const [concept, applies] of Object.entries(expected)) {
      expect(r.applicable[`tas.delivery.${concept}.v1`]).toBe(applies);
    }
  });

  it('work placement: the description follows a yes, not a no or an unanswered question', () => {
    const q = 'tas.placement.required.v1';
    const d = 'tas.placement.description.v1';
    expect(ev({ [MODES]: answered(['workplace']) }).applicable[q]).toBe(true);
    expect(ev({ [q]: answered('yes') }).applicable[d]).toBe(true);
    expect(ev({ [q]: answered('no') }).applicable[d]).toBe(false);
    expect(ev({}).applicable[d]).toBe(false);
  });

  it('licensing: a yes opens the details and raises the licensing flag', () => {
    const r = ev({ 'tas.licensing.required.v1': answered('yes') });
    expect(r.applicable['tas.licensing.details.v1']).toBe(true);
    expect(r.flags).toContain('licensing');
    expect(ev({ 'tas.licensing.required.v1': answered('no') }).flags).not.toContain('licensing');
  });

  it.each([['yes', true], ['unsure', true], ['no', false]])('under-18 answer %s raises the minor flag: %s', (v, raised) => {
    expect(ev({ 'tas.cohort.under18.v1': answered(v) }).flags.includes('minor')).toBe(raised);
  });

  it('learner support follows the learner-gaps answer, and sensitive topics raise a flag', () => {
    const gaps = 'tas.cohort.entry_skills_gaps.v1';
    expect(ev({}).applicable['tas.support.disability.v1']).toBe(false);
    const r = ev({ [gaps]: answered('some'), 'tas.support.disability.v1': answered('yes') });
    expect(r.applicable['tas.support.disability.v1']).toBe(true);
    expect(r.flags).toContain('sensitive_information');
  });

  it('third-party delivery raises its flag only on yes', () => {
    expect(ev({ 'tas.facilities.third_party_delivery.v1': answered('yes') }).flags).toContain('third_party_delivery');
    expect(ev({ 'tas.facilities.third_party_delivery.v1': answered('no') }).flags).not.toContain('third_party_delivery');
  });

  it('evidence slots follow their parent question', () => {
    expect(ev({}).applicable['tas.evidence.surveys_file.v1']).toBe(false);
    expect(ev({ 'tas.industry.surveys.v1': answered('yes') }).applicable['tas.evidence.surveys_file.v1']).toBe(true);
  });

  it('commercial questions are never asked in the starter flow', () => {
    const r = ev({});
    expect(r.askable.some((k) => k.startsWith('tas.commercial.'))).toBe(false);
  });
});

describe('changing an earlier answer flags, never deletes', () => {
  it('switching international to domestic flags the answered entry questions and keeps their values', () => {
    const answers: AnswerMap = { [MARKET]: answered('international'), 'tas.entry.ielts.v1': answered('6.5') };
    expect(ev(answers).flagged).toEqual([]);
    const changed: AnswerMap = { ...answers, [MARKET]: answered('domestic') };
    const r = ev(changed);
    expect(r.applicable['tas.entry.ielts.v1']).toBe(false);
    expect(r.flagged).toContain('tas.entry.ielts.v1');
    expect(changed['tas.entry.ielts.v1']).toEqual(answered('6.5'));
  });
});

describe('starter readiness (D3)', () => {
  const starterKeys = CATALOGUE.filter((e) => e.topic).map((e) => e.key);
  it('has five topics and is not ready with no answers', () => {
    const s = starterStatus(CATALOGUE, {});
    expect(s.topics).toHaveLength(5);
    expect(s.readyForReview).toBe(false);
  });
  it('is ready when every starter question is answered or marked not decided / needs advice, with no evidence', () => {
    const answers: AnswerMap = {};
    starterKeys.forEach((k, i) => {
      answers[k] = i % 3 === 0 ? answered('x') : i % 3 === 1 ? { state: 'not_decided' } : { state: 'needs_advice' };
    });
    expect(starterStatus(CATALOGUE, answers).readyForReview).toBe(true);
  });
  it('is not ready if one starter question is still unanswered', () => {
    const answers: AnswerMap = {};
    starterKeys.slice(1).forEach((k) => (answers[k] = answered('x')));
    expect(starterStatus(CATALOGUE, answers).readyForReview).toBe(false);
  });
});
