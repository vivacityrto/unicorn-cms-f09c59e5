import { describe, expect, it } from 'vitest';
import { appendDictation, appendLabelledDictation, isEchoOf } from './dictation';

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

describe('echo between two people dictating on one call', () => {
  const ben = 'Ben: We should move the launch to the end of November';

  it('drops a chunk that repeats what another person just dictated', () => {
    expect(appendLabelledDictation(ben, 'we should move the launch to the end of november', 'Amy')).toBe(ben);
  });

  it('still drops it when recognition worded one word differently', () => {
    expect(appendLabelledDictation(ben, 'we should move the launch to the end of the november', 'Amy')).toBe(ben);
  });

  it('keeps a different sentence', () => {
    expect(appendLabelledDictation(ben, 'I will tell the client tomorrow', 'Amy')).toBe(`${ben}\nAmy: I will tell the client tomorrow`);
  });

  it('never drops short replies', () => {
    expect(appendLabelledDictation('Ben: Agreed', 'agreed', 'Amy')).toBe('Ben: Agreed\nAmy: Agreed');
  });

  it('does not drop a person repeating their own words', () => {
    const own = 'Amy: we should move the launch to the end of november';
    expect(appendLabelledDictation(own, 'we should move the launch to the end of november', 'Amy')).toBe(
      `${own} we should move the launch to the end of november`,
    );
  });

  it('ignores the speaker label when comparing', () => {
    expect(isEchoOf('Amy: we should move the launch', 'Ben: we should move the launch')).toBe(true);
  });

  it('is not fooled by common words that merely appear in a long line', () => {
    expect(isEchoOf('we need to do that', 'Ben: we need to talk about the budget before friday and then we can do it')).toBe(false);
  });

  it('keeps a chunk that holds an earlier sentence plus new information', () => {
    const chunk = 'we should move the launch to the end of november and I will tell the client tomorrow about the new plan';
    expect(isEchoOf(chunk, 'Ben: We should move the launch to the end of November')).toBe(false);
    expect(appendLabelledDictation('Ben: We should move the launch to the end of November', chunk, 'Amy')).toContain('Amy: ');
  });

  it('still drops a repeat of one sentence inside a longer line from someone else', () => {
    expect(isEchoOf('we should move the launch to the end of november', 'Ben: Agreed. We should move the launch to the end of November. Then we tell the client.')).toBe(true);
  });
});

