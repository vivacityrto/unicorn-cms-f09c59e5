/**
 * Sanitizer regression tests for the two dangerouslySetInnerHTML preview
 * sinks fixed in the RBAC/security remediation pass (F-029 academy lesson
 * preview, F-030 stage email preview): LessonEditorPanel now runs content
 * through sanitizeHtml(), StageSimulationDialog through sanitizeEmailHtml().
 */
import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeEmailHtml } from './sanitize';

describe('sanitizeHtml (academy lesson preview)', () => {
  it('strips <script> tags', () => {
    const out = sanitizeHtml('<p>Hello</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('Hello');
  });

  it('strips onerror handlers from img tags', () => {
    const out = sanitizeHtml('<img src=x onerror="alert(document.cookie)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert(document.cookie)');
  });

  it('strips javascript: URLs from links', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click me</a>');
    expect(out).not.toMatch(/href\s*=\s*"javascript:/i);
    expect(out).toContain('click me');
  });

  it('retains intended formatting markup', () => {
    const out = sanitizeHtml('<p>Hello <b>world</b></p><br/>');
    expect(out).toContain('<p>Hello <b>world</b></p>');
    expect(out).toContain('<br');
  });
});

describe('sanitizeEmailHtml (stage email preview)', () => {
  it('strips <script> tags from rendered email bodies', () => {
    const out = sanitizeEmailHtml('<div>Welcome</div><script>fetch("https://evil.example")</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('evil.example');
    expect(out).toContain('Welcome');
  });

  it('strips onerror handlers even when merge values are attacker-controlled', () => {
    const maliciousClientName = '<img src=x onerror=alert(1)>';
    const out = sanitizeEmailHtml(`<p>Hi ${maliciousClientName},</p>`);
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('strips event handler attributes on otherwise-allowed table markup', () => {
    const out = sanitizeEmailHtml('<table><tr onmouseover="alert(1)"><td>Row</td></tr></table>');
    expect(out).not.toContain('onmouseover');
    expect(out).toContain('Row');
  });

  it('retains email-specific formatting tags (font, center)', () => {
    const out = sanitizeEmailHtml('<center><font color="red">Important</font></center>');
    expect(out).toContain('Important');
    expect(out).toMatch(/<font[^>]*color="red"[^>]*>/);
  });
});
