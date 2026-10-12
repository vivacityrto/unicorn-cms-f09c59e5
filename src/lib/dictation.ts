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

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Appends a dictated chunk to meeting notes under the speaker's name. Dictation arrives one
 * chunk per pause, so the label is only added when the speaker changes: while the last line
 * already starts with "<speaker>: " the chunk just continues that line; otherwise (empty notes,
 * someone else's line, or untyped text) it starts a new line "<speaker>: ...". Lines from other
 * people who dictated on their own computer arrive in the shared notes, so the next chunk sees
 * them and starts a new labelled line. Returns the existing text unchanged for a blank chunk.
 */
export function appendLabelledDictation(existing: string, chunk: string, speaker: string): string {
  const text = chunk.trim();
  const name = speaker.trim();
  if (!text) return existing;
  if (!name) return appendDictation(existing, chunk);

  const label = `${name}: `;
  const base = existing.replace(/\s+$/, '');
  if (!base) return `${label}${capitalise(text)}`;

  const lastLine = base.slice(base.lastIndexOf('\n') + 1);
  if (lastLine.startsWith(label)) {
    return `${base} ${SENTENCE_END.test(base) ? capitalise(text) : text}`;
  }
  return `${base}\n${label}${capitalise(text)}`;
}
