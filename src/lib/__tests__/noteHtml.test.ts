import { describe, it, expect } from 'vitest';
import { plainTextToNoteHtml, noteHtmlToPlainText } from '@/lib/noteHtml';

describe('plainTextToNoteHtml', () => {
  it('wraps text in a paragraph', () => {
    expect(plainTextToNoteHtml('Hello')).toBe('<p>Hello</p>');
  });

  it('turns blank lines into paragraphs and single newlines into <br>', () => {
    expect(plainTextToNoteHtml('one\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>');
  });

  it('escapes HTML so typed markup cannot be injected', () => {
    expect(plainTextToNoteHtml('<script>alert("x")</script> & more')).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more</p>'
    );
  });

  it('returns an empty string for blank input', () => {
    expect(plainTextToNoteHtml('   \n  ')).toBe('');
  });
});

describe('noteHtmlToPlainText', () => {
  it('strips tags and joins paragraphs with a space', () => {
    expect(noteHtmlToPlainText('<p>First</p><p>Second <strong>bold</strong></p>')).toBe('First Second bold');
  });

  it('decodes the entities plainTextToNoteHtml produces (round trip)', () => {
    const text = 'Tom & Jerry <3 "quotes"';
    expect(noteHtmlToPlainText(plainTextToNoteHtml(text))).toBe(text);
  });

  it('handles null/undefined', () => {
    expect(noteHtmlToPlainText(null)).toBe('');
    expect(noteHtmlToPlainText(undefined)).toBe('');
  });
});
