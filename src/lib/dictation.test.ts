import { describe, expect, it } from 'vitest';
import { appendDictation } from './dictation';

describe('appendDictation', () => {
  it('capitalises the first chunk', () => {
    expect(appendDictation('', 'we need a second consultant')).toBe('We need a second consultant');
  });

  it('joins chunks mid-sentence with one space and leaves case alone', () => {
    expect(appendDictation('We need', ' a second consultant ')).toBe('We need a second consultant');
  });

  it('capitalises after a full stop, question mark or exclamation mark', () => {
    expect(appendDictation('Done.', 'next item')).toBe('Done. Next item');
    expect(appendDictation('Is that right?', 'yes')).toBe('Is that right? Yes');
    expect(appendDictation('Great!', 'moving on')).toBe('Great! Moving on');
  });

  it('starts a new line without adding a space', () => {
    expect(appendDictation('First point\n', 'second point')).toBe('First point\nSecond point');
  });

  it('ignores trailing spaces on the existing text', () => {
    expect(appendDictation('Agreed   ', 'then we proceed')).toBe('Agreed then we proceed');
  });

  it('returns the existing text unchanged for a blank chunk', () => {
    expect(appendDictation('Keep this', '   ')).toBe('Keep this');
    expect(appendDictation('', '')).toBe('');
  });
});
