import type {
  AnswerMap,
  AnswerState,
  CatalogueEntry,
  ClientType,
  Condition,
  IntakeFlag,
  StarterTopic,
} from './types.ts';

// Pure branch engine for the TAS intake catalogue. No I/O, no React. A branch change never deletes
// an answer: an answer whose question stops applying is reported in `flagged` and kept.

const SETTLED: AnswerState[] = ['answered', 'not_applicable', 'not_decided', 'needs_advice'];

/** Values an answer currently carries, as a list (single values become one-element lists). */
function valuesOf(answers: AnswerMap, key: string): string[] {
  const a = answers[key];
  if (!a || a.state !== 'answered' || a.value == null) return [];
  return Array.isArray(a.value) ? a.value : [a.value];
}

export function evaluateCondition(cond: Condition, answers: AnswerMap): boolean {
  switch (cond.op) {
    case 'always':
      return true;
    case 'answered':
      return answers[cond.key]?.state === 'answered';
    case 'eq':
      return valuesOf(answers, cond.key)[0] === cond.value;
    case 'in': {
      const v = valuesOf(answers, cond.key)[0];
      return v !== undefined && cond.values.includes(v);
    }
    case 'includes_any':
      return valuesOf(answers, cond.key).some((v) => cond.values.includes(v));
    case 'all':
      return cond.of.every((c) => evaluateCondition(c, answers));
    case 'any':
      return cond.of.some((c) => evaluateCondition(c, answers));
    case 'not':
      return !evaluateCondition(cond.of, answers);
  }
}

export interface ClientGate {
  ok: boolean;
  flags: IntakeFlag[];
  /** Set when ok is false. */
  reason?: string;
}

/** GTO clients are refused at creation (D18); CRICOS clients carry a National Code review flag. */
export function clientTypeGate(clientType: ClientType): ClientGate {
  if (clientType === 'gto') {
    return {
      ok: false,
      flags: [],
      reason: 'Group training organisation clients follow the National Standards for GTOs 2017; the RTO intake does not apply.',
    };
  }
  return { ok: true, flags: clientType === 'cricos' ? ['national_code_review'] : [] };
}

export interface IntakeEvaluation {
  /** Every key mapped to whether its question applies given the current answers. */
  applicable: Record<string, boolean>;
  /** Applicable questions in the starter, branch and prefill phases that have no settled answer yet. */
  askable: string[];
  /** Questions that have an answer but no longer apply. Never deleted; the UI shows them as flagged. */
  flagged: string[];
  /** Flags for the consultant brief. */
  flags: IntakeFlag[];
}

export function evaluateIntake(
  catalogue: CatalogueEntry[],
  answers: AnswerMap,
  clientType: ClientType = 'rto',
): IntakeEvaluation {
  const gate = clientTypeGate(clientType);
  if (!gate.ok) throw new Error(gate.reason);
  const applicable: Record<string, boolean> = {};
  const flagged: string[] = [];
  const askable: string[] = [];
  const flags = new Set<IntakeFlag>(gate.flags);

  for (const e of catalogue) {
    const applies = evaluateCondition(e.requiresWhen, answers);
    applicable[e.key] = applies;
    const a = answers[e.key];
    const hasAnswer = !!a && a.state !== 'unanswered';
    if (!applies && hasAnswer) flagged.push(e.key);
    if (applies && ['prefill', 'starter', 'branch'].includes(e.phase) && !(a && SETTLED.includes(a.state))) {
      askable.push(e.key);
    }
    if (applies && e.raisesFlag && a?.state === 'answered') {
      const { flag, whenIn } = e.raisesFlag;
      if (!whenIn || valuesOf(answers, e.key).some((v) => whenIn.includes(v))) flags.add(flag);
    }
  }
  // International cohorts need the consultant to check the National Code requirements.
  if (['international', 'both'].includes(valuesOf(answers, 'tas.cohort.delivery_market.v1')[0] ?? '')) {
    flags.add('national_code_review');
  }
  return { applicable, askable, flagged, flags: [...flags] };
}

export interface TopicStatus {
  topic: StarterTopic;
  total: number;
  settled: number;
  complete: boolean;
}

/**
 * Starter progress for decision D3: a consultant review can start once each of the five starter
 * topics is answered or explicitly marked not decided / needs advice. Evidence is never required.
 * A topic is complete when every question in it is settled (provisional granularity).
 */
export function starterStatus(catalogue: CatalogueEntry[], answers: AnswerMap) {
  const topics = new Map<StarterTopic, TopicStatus>();
  for (const e of catalogue) {
    if (!e.topic) continue;
    const t = topics.get(e.topic) ?? { topic: e.topic, total: 0, settled: 0, complete: false };
    t.total += 1;
    if (answers[e.key] && SETTLED.includes(answers[e.key]!.state)) t.settled += 1;
    topics.set(e.topic, t);
  }
  const list = [...topics.values()].map((t) => ({ ...t, complete: t.settled === t.total }));
  return { topics: list, readyForReview: list.length === 5 && list.every((t) => t.complete) };
}
