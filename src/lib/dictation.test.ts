import { describe, expect, it } from 'vitest';
import { appendDictation, appendLabelledDictation } from './dictation';

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

describe('appendLabelledDictation', () => {
  it('starts the notes with the speaker label and capitalises', () => {
    expect(appendLabelledDictation('', 'we should cancel ghl', 'Nova')).toBe('Nova: We should cancel ghl');
  });

  it('continues the same line while the same person keeps speaking', () => {
    const first = appendLabelledDictation('', 'we should cancel ghl', 'Nova');
    const second = appendLabelledDictation(first, 'and review the plan', 'Nova');
    expect(second).toBe('Nova: We should cancel ghl and review the plan');
  });

  it('capitalises the continuation after a full stop', () => {
    expect(appendLabelledDictation('Nova: Done.', 'next point', 'Nova')).toBe('Nova: Done. Next point');
  });

  it('starts a new labelled line when someone else spoke last', () => {
    const notes = 'Angela: I think we need two more consultants';
    expect(appendLabelledDictation(notes, 'agreed', 'Nova')).toBe(`${notes}\nNova: Agreed`);
  });

  it('starts a new labelled line after untyped text', () => {
    expect(appendLabelledDictation('Raised by Dave.', 'cost is too high', 'Nova')).toBe(
      'Raised by Dave.\nNova: Cost is too high',
    );
  });

  it('does not confuse a name that is a prefix of another name', () => {
    const notes = 'Novak: first point';
    expect(appendLabelledDictation(notes, 'second point', 'Nova')).toBe(`${notes}\nNova: Second point`);
  });

  it('ignores trailing blank lines before deciding', () => {
    expect(appendLabelledDictation('Nova: First\n\n', 'second', 'Nova')).toBe('Nova: First second');
  });

  it('falls back to plain dictation when there is no name', () => {
    expect(appendLabelledDictation('Hello', 'world', '  ')).toBe('Hello world');
  });

  it('returns the existing text unchanged for a blank chunk', () => {
    expect(appendLabelledDictation('Nova: Hi', '   ', 'Nova')).toBe('Nova: Hi');
  });
});
