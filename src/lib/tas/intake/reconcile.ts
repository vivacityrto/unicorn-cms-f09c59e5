// Reconciles the TAS intake catalogue against the 113 legacy survey fields (L001 to L113).
// Dependency-free so the vitest suite and scripts/tas-reconcile-legacy-map.mjs share one check.
// Works on plain objects and never sees legacy wording: only ids, keys and structure.

interface Entry {
  key: string;
  cls: string;
  topic: string | null;
  legacyIds: string[];
  requiresWhen: unknown;
  parentKey?: string;
  placeholder: string;
}

export const EXPECTED = {
  legacyFields: 113,
  questions: 88,
  starterQuestions: 16,
  starterLegacyFields: 26,
  byClass: {
    prefill_confirm: 13,
    starter_topic: 16,
    consultant_led: 3,
    branch_client: 45,
    research: 7,
    evidence_attachment: 4,
  } as Record<string, number>,
};

const KEY_RE = /^tas\.[a-z0-9]+\.[a-z0-9_]+\.v[0-9]+$/;

function conditionKeys(c: unknown, out: string[] = []): string[] {
  if (!c || typeof c !== 'object') return out;
  const o = c as Record<string, unknown>;
  if (typeof o.key === 'string') out.push(o.key);
  if (Array.isArray(o.of)) o.of.forEach((x) => conditionKeys(x, out));
  if (o.of && !Array.isArray(o.of)) conditionKeys(o.of, out);
  return out;
}

/** Returns a list of problems; an empty list means the catalogue reconciles. */
export function reconcileCatalogue(entries: Entry[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();

  for (const e of entries) {
    if (!KEY_RE.test(e.key)) problems.push(`bad key format: ${e.key}`);
    if (keys.has(e.key)) problems.push(`duplicate key: ${e.key}`);
    keys.add(e.key);
    // D19: the public repository carries placeholder wording only.
    if (e.placeholder !== `[${e.key}]`) problems.push(`non-placeholder wording on ${e.key}`);
  }
  if (entries.length !== EXPECTED.questions) problems.push(`expected ${EXPECTED.questions} questions, found ${entries.length}`);

  // Every legacy id L001..L113 maps to exactly one question.
  const owner = new Map<string, string>();
  for (const e of entries) {
    for (const id of e.legacyIds) {
      if (!/^L[0-9]{3}$/.test(id)) problems.push(`bad legacy id ${id} on ${e.key}`);
      if (owner.has(id)) problems.push(`legacy id ${id} mapped twice (${owner.get(id)} and ${e.key})`);
      owner.set(id, e.key);
    }
  }
  for (let n = 1; n <= EXPECTED.legacyFields; n += 1) {
    const id = `L${String(n).padStart(3, '0')}`;
    if (!owner.has(id)) problems.push(`legacy id ${id} has no disposition`);
  }
  if (owner.size !== EXPECTED.legacyFields) problems.push(`expected ${EXPECTED.legacyFields} legacy ids, found ${owner.size}`);

  // Classes and the starter slice (26 fields, 16 questions).
  const byClass: Record<string, number> = {};
  for (const e of entries) byClass[e.cls] = (byClass[e.cls] ?? 0) + 1;
  for (const [cls, n] of Object.entries(EXPECTED.byClass)) {
    if ((byClass[cls] ?? 0) !== n) problems.push(`class ${cls}: expected ${n}, found ${byClass[cls] ?? 0}`);
  }
  const starter = entries.filter((e) => e.topic !== null);
  if (starter.length !== EXPECTED.starterQuestions) problems.push(`expected ${EXPECTED.starterQuestions} starter questions, found ${starter.length}`);
  const starterFields = starter.reduce((n, e) => n + e.legacyIds.length, 0);
  if (starterFields !== EXPECTED.starterLegacyFields) problems.push(`expected ${EXPECTED.starterLegacyFields} starter legacy fields, found ${starterFields}`);
  const topics = new Set(starter.map((e) => e.topic));
  if (topics.size !== 5) problems.push(`expected 5 starter topics, found ${topics.size}`);

  // Every reference resolves.
  for (const e of entries) {
    if (e.parentKey && !keys.has(e.parentKey)) problems.push(`${e.key}: unknown parent ${e.parentKey}`);
    for (const ref of conditionKeys(e.requiresWhen)) {
      if (!keys.has(ref)) problems.push(`${e.key}: condition references unknown key ${ref}`);
    }
  }
  return problems;
}
