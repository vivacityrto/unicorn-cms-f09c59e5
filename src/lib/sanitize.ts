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
