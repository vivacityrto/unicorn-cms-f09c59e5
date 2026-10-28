const SENTENCE_END = /[.!?]["')\]]*\s*$/;

/**
 * Appends a dictated chunk to existing text. Browser speech recognition returns lowercase,
 * unpunctuated chunks (one per pause), so this joins them with a single space and capitalises
 * the first letter when the chunk starts a new sentence (empty text, or text ending in . ! ?).
 * Returns the existing text unchanged when the chunk is blank.
 */
export function appendDictation(existing: string, chunk: string): string {
  const text = chunk.trim();
  if (!text) return existing;
  const base = existing.replace(/[ \t]+$/, '');
  if (!base) return text.charAt(0).toUpperCase() + text.slice(1);
  const startsSentence = SENTENCE_END.test(base) || base.endsWith('\n');
  const piece = startsSentence ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  return base.endsWith('\n') ? `${base}${piece}` : `${base} ${piece}`;
}

/** Words of a line, lowercased and unpunctuated, with any leading "Name: " speaker label removed. */
function wordsOf(line: string): string[] {
  return line
    .replace(/^[^:\n]{1,40}:\s+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const bigramsOf = (words: string[]) => words.slice(0, -1).map((w, i) => `${w} ${words[i + 1]}`);

/** Share of `part`'s consecutive word pairs that also occur in `whole`. */
function bigramContainment(part: string[], whole: string[]): number {
  const pairs = bigramsOf(part);
  if (pairs.length === 0) return 0;
  const available = new Set(bigramsOf(whole));
  return pairs.filter(pair => available.has(pair)).length / pairs.length;
}

const ECHO_MIN_WORDS = 4;
const ECHO_THRESHOLD = 0.7;

/**
 * Whether two pieces of dictated text say the same thing. When two people on one call both
 * dictate, each microphone also hears the other person (through the speakers), so the same
 * sentence is transcribed twice with small differences in wording. Comparing consecutive word
 * pairs, not single words, keeps a chunk made of common words ("we need to do that") from being
 * mistaken for an echo of a long line that happens to contain them. Needs at least four words on
 * the shorter side, so short replies like "yes, agreed" are never dropped.
 */
export function isEchoOf(a: string, b: string): boolean {
  const wordsA = wordsOf(a);
  const wordsB = wordsOf(b);
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  if (shorter.length < ECHO_MIN_WORDS) return false;
  return bigramContainment(shorter, longer) >= ECHO_THRESHOLD;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Appends a dictated chunk to meeting notes under the speaker's name. Dictation arrives one
 * chunk per pause, so the label is only added when the speaker changes: while the last line
 * already starts with "<speaker>: " the chunk just continues that line; otherwise (empty notes,
 * someone else's line, or untyped text) it starts a new line "<speaker>: ...". Lines from other
 * people who dictated on their own computer arrive in the shared notes, so the next chunk sees
 * them and starts a new labelled line. A chunk that repeats what another person's line just said
 * (their microphone and ours both heard the same sentence) is dropped. Returns the existing text unchanged for a blank chunk.
 */
export function appendLabelledDictation(existing: string, chunk: string, speaker: string): string {
  const text = chunk.trim();
  const name = speaker.trim();
  if (!text) return existing;
  if (!name) return appendDictation(existing, chunk);

  const label = `${name}: `;
  const base = existing.replace(/\s+$/, '');
  if (!base) return `${label}${capitalise(text)}`;

  // Someone else's microphone already put this sentence in the notes: do not add it twice.
  const recentOthers = base
    .split('\n')
    .slice(-3)
    .filter(line => line.trim() && !line.startsWith(label));
  if (recentOthers.some(line => isEchoOf(text, line))) return existing;

  const lastLine = base.slice(base.lastIndexOf('\n') + 1);
  if (lastLine.startsWith(label)) {
    return `${base} ${SENTENCE_END.test(base) ? capitalise(text) : text}`;
  }
  return `${base}\n${label}${capitalise(text)}`;
}
