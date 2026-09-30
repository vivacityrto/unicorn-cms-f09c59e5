const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Converts plain text (e.g. from a textarea) into the HTML the `notes` table
 * stores in `note_details`. Text is escaped, blank lines start a new
 * paragraph and single newlines become <br>.
 */
export function plainTextToNoteHtml(text: string): string {
  const escaped = text.trim().replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
  if (!escaped) return '';
  return escaped
    .split(/\r?\n\s*\r?\n/)
    .map((para) => `<p>${para.replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

/** Strips tags and decodes the few entities note HTML uses, for previews. */
export function noteHtmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
