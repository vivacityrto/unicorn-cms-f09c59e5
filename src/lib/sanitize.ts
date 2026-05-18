import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Use this whenever rendering user-provided HTML with dangerouslySetInnerHTML.
 */
export function sanitizeHtml(unsafeHtml: string): string {
  return DOMPurify.sanitize(unsafeHtml, {
    ALLOWED_TAGS: [
      'p', 'b', 'i', 'u', 'a', 'br', 'strong', 'em', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'blockquote', 'pre', 'code', 'hr',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'class', 'style', 'src', 'alt', 'width', 'height',
      'rel', 'title', 'id',
    ],
    // Allow data: URIs for inline images in email templates
    ALLOW_DATA_ATTR: false,
    // Force all links to open in new tab for safety
    ADD_ATTR: ['target'],
  });
}

/**
 * Sanitize HTML specifically for email template previews.
 * Slightly more permissive to support email HTML.
 */
export function sanitizeEmailHtml(unsafeHtml: string): string {
  return DOMPurify.sanitize(unsafeHtml, {
    ALLOWED_TAGS: [
      'p', 'b', 'i', 'u', 'a', 'br', 'strong', 'em', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'blockquote', 'pre', 'code', 'hr',
      'center', 'font', 'style',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'class', 'style', 'src', 'alt', 'width', 'height',
      'rel', 'title', 'id', 'align', 'valign', 'bgcolor', 'border',
      'cellpadding', 'cellspacing', 'color', 'face', 'size',
    ],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Convert plain text with newlines to safe HTML.
 * Escapes HTML entities and converts newlines to proper HTML.
 */
export function textToSafeHtml(text: string): string {
  if (!text) return '';
  
  // First escape HTML entities to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  // Then convert newlines to HTML
  return escaped
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

/**
 * Strip HTML to plain text. Preserves text content, decodes HTML
 * entities (&nbsp; → space, &amp; → &, etc.), collapses whitespace.
 * Use for surfaces where rich text needs to be flattened — e.g.
 * tooltips, list previews, summary chips.
 *
 * @param html - HTML string (or null/undefined)
 * @param maxLen - optional max length; longer text is truncated
 *                with an ellipsis
 */
export function htmlToText(html: string | null | undefined, maxLen?: number): string {
  if (!html) return '';
  // Parse via a detached <div> so the browser decodes HTML entities
  // (&nbsp;, &amp;, etc.) and strips tags in one pass. Detached
  // elements don't execute scripts or fire event handlers, so this
  // is XSS-safe for text extraction.
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = (tmp.textContent || tmp.innerText || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLen && text.length > maxLen) {
    return text.slice(0, maxLen).trimEnd() + '…';
  }
  return text;
}
