import { sanitizeHtml } from '@/lib/sanitize';

/**
 * Sanitize note body HTML. Allowlist matches what RichTextEditor
 * (StarterKit + Link + Underline + TextAlign, heading levels 2/3)
 * can actually produce, so toolbar formatting survives round-trips.
 * Anchors are forced to open in a new tab with rel=noopener.
 */
export function sanitizeNoteHtml(unsafe: string): string {
  if (!unsafe) return '';
  const cleaned = sanitizeHtml(unsafe, {
    tags: [
      'p', 'br', 'strong', 'em', 'u', 's',
      'h2', 'h3',
      'ul', 'ol', 'li',
      'blockquote', 'hr',
      'a', 'span',
    ],
    attrs: ['href', 'target', 'rel', 'class', 'style'],
  });
  // Force safe anchor attributes.
  return cleaned.replace(
    /<a\b([^>]*)>/gi,
    (_m, attrs) => {
      // Drop any existing target/rel, then re-add safe defaults.
      const stripped = String(attrs)
        .replace(/\s+target="[^"]*"/gi, '')
        .replace(/\s+rel="[^"]*"/gi, '');
      return `<a${stripped} target="_blank" rel="noopener noreferrer">`;
    },
  );
}
