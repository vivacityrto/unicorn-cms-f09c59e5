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
