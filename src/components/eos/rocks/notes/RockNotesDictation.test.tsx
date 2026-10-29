/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

const addNote = vi.fn();
vi.mock('@/hooks/useRockNotes', () => ({ useAddRockNote: () => ({ mutateAsync: addNote }) }));

import { RockNotesDictationProvider, useRockNotesDictation } from '@/components/eos/rocks/notes/RockNotesDictation';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  started = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.started = false;
  }
  say(text: string) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
  }
}
const mic = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

const wrapper = ({ children }: { children: ReactNode }) => <RockNotesDictationProvider meetingId="m1">{children}</RockNotesDictationProvider>;
const setup = () => renderHook(() => useRockNotesDictation(), { wrapper });

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  addNote.mockReset();
  addNote.mockResolvedValue({ note_id: 'n1', created_at: '2026-10-28T00:00:00Z', duplicate: false });
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
});

describe('RockNotesDictationProvider', () => {
  it('writes dictation into the draft of the Rock the microphone was started for', () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('first point'));
    act(() => mic().say('second point'));
    expect(result.current.getDraft('rock-a')).toBe('First point second point');
    expect(result.current.getDraft('rock-b')).toBe('');
    expect(result.current.activeRockId).toBe('rock-a');
    expect(result.current.isRecording).toBe(true);
  });

  it('hands the microphone over on Next: the Rock left is saved, a new session starts for the next Rock, and only one is ever live', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('about the first rock'));

    await act(async () => {
      result.current.retarget('rock-b');
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(addNote).toHaveBeenCalledWith({ rockId: 'rock-a', body: 'About the first rock', meetingId: 'm1', source: 'dictated' });
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(FakeRecognition.instances.filter(i => i.started)).toHaveLength(1);
    expect(result.current.activeRockId).toBe('rock-b');
    expect(result.current.handingOverFromRockId).toBeNull();

    act(() => mic().say('about the second rock'));
    expect(result.current.getDraft('rock-b')).toBe('About the second rock');
    expect(result.current.getDraft('rock-a')).toBe('');
  });

  it('does nothing on a Rock change when the microphone is off', async () => {
    const { result } = setup();
    act(() => result.current.setDraft('rock-a', 'typed but not added'));
    await act(async () => result.current.retarget('rock-b'));
    expect(addNote).not.toHaveBeenCalled();
    expect(result.current.getDraft('rock-a')).toBe('typed but not added');
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it('turning the microphone off keeps the draft for review instead of saving it', () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('half a thought'));
    act(() => result.current.stopMic());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.activeRockId).toBeNull();
    expect(result.current.getDraft('rock-a')).toBe('Half a thought');
    expect(addNote).not.toHaveBeenCalled();
  });

  it('a phrase the browser finishes after stop still lands in the right draft', () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    const session = mic();
    session.stop = () => {
      // The browser delivers the phrase it was still working on, then ends the session.
      session.say('last words');
      session.started = false;
      session.onend?.();
    };
    act(() => result.current.stopMic());
    expect(result.current.getDraft('rock-a')).toBe('Last words');
  });

  it('saves a typed draft as typed, and keeps text added while the save is in flight', async () => {
    const { result } = setup();
    let finish: () => void = () => undefined;
    addNote.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ note_id: 'n', created_at: 'x', duplicate: false }); }));

    act(() => result.current.setDraft('rock-a', 'agreed to move the date'));
    let saving: Promise<boolean> = Promise.resolve(false);
    act(() => { saving = result.current.saveDraft('rock-a'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.isSaving('rock-a')).toBe(true);
    expect(addNote).toHaveBeenCalledWith({ rockId: 'rock-a', body: 'agreed to move the date', meetingId: 'm1', source: 'typed' });

    act(() => result.current.setDraft('rock-a', 'agreed to move the date and one more thing'));
    await act(async () => { finish(); await saving; });
    expect(result.current.getDraft('rock-a')).toBe('and one more thing');
    expect(result.current.isSaving('rock-a')).toBe(false);
  });

  it('does not add the same note twice when saved twice at once', async () => {
    const { result } = setup();
    let finish: () => void = () => undefined;
    addNote.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ note_id: 'n', created_at: 'x', duplicate: false }); }));
    act(() => result.current.setDraft('rock-a', 'once only'));
    act(() => { void result.current.saveDraft('rock-a'); void result.current.saveDraft('rock-a'); });
    await act(async () => finish());
    expect(addNote).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft when saving fails', async () => {
    const { result } = setup();
    addNote.mockRejectedValue(new Error('network'));
    act(() => result.current.setDraft('rock-a', 'do not lose me'));
    let saved = true;
    await act(async () => { saved = await result.current.saveDraft('rock-a'); });
    expect(saved).toBe(false);
    expect(result.current.getDraft('rock-a')).toBe('do not lose me');
  });

  it('flushAll stops the microphone and saves every draft', async () => {
    const { result } = setup();
    act(() => result.current.setDraft('rock-a', 'draft a'));
    act(() => result.current.startFor('rock-b'));
    act(() => mic().say('spoken for b'));
    await act(async () => {
      const flushing = result.current.flushAll();
      await vi.advanceTimersByTimeAsync(2500);
      await flushing;
    });
    expect(result.current.isRecording).toBe(false);
    expect(addNote.mock.calls.map(call => [call[0].rockId, call[0].source]).sort()).toEqual([['rock-a', 'typed'], ['rock-b', 'dictated']]);
  });

  it('pressing Dictate on another Rock while listening hands over to it the same way', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('for a'));
    await act(async () => {
      result.current.startFor('rock-b');
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(result.current.activeRockId).toBe('rock-b');
    expect(FakeRecognition.instances.filter(i => i.started)).toHaveLength(1);
    expect(addNote).toHaveBeenCalledWith(expect.objectContaining({ rockId: 'rock-a', body: 'For a' }));
  });

  it('while handing over, the Rock being left keeps the microphone and is named so the screen can say so', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    const session = mic();
    session.stop = () => { setTimeout(() => { session.started = false; session.onend?.(); }, 400); };
    act(() => result.current.retarget('rock-b'));
    expect(result.current.handingOverFromRockId).toBe('rock-a');
    expect(result.current.activeRockId).toBe('rock-a');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(result.current.handingOverFromRockId).toBeNull();
    expect(result.current.activeRockId).toBe('rock-b');
  });

  it('Stop pressed during the hand-over still saves the Rock left, and nothing is written to the next one', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('note for a'));
    const session = mic();
    session.stop = () => { setTimeout(() => { session.say('late tail'); session.started = false; session.onend?.(); }, 200); };
    act(() => result.current.retarget('rock-b'));
    act(() => result.current.stopMic());
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(addNote).toHaveBeenCalledWith(expect.objectContaining({ rockId: 'rock-a', body: 'Note for a late tail' }));
    expect(result.current.isRecording).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(result.current.getDraft('rock-b')).toBe('');
  });

  it('Next twice in a row skips the Rock in between: A is saved, the microphone ends up on C, B never gets text', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('note for a'));
    const session = mic();
    session.stop = () => { setTimeout(() => { session.say('tail of a'); session.started = false; session.onend?.(); }, 200); };
    act(() => result.current.retarget('rock-b'));
    act(() => result.current.retarget('rock-c'));
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(result.current.activeRockId).toBe('rock-c');
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(addNote).toHaveBeenCalledWith(expect.objectContaining({ rockId: 'rock-a', body: 'Note for a tail of a' }));
    expect(result.current.getDraft('rock-b')).toBe('');
  });

  it('going back to the same Rock during the hand-over restarts it without saving or losing anything', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('note for a'));
    const session = mic();
    session.stop = () => { setTimeout(() => { session.started = false; session.onend?.(); }, 300); };
    act(() => result.current.retarget('rock-b'));
    act(() => result.current.retarget('rock-a'));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(addNote).not.toHaveBeenCalled();
    expect(result.current.activeRockId).toBe('rock-a');
    expect(result.current.getDraft('rock-a')).toBe('Note for a');
  });

  it('with the microphone off, Next still saves the note that was being written for the Rock left (typed or dictated)', async () => {
    const { result } = setup();
    act(() => result.current.retarget('rock-a'));
    act(() => result.current.setDraft('rock-a', 'typed note for a'));
    await act(async () => { result.current.retarget('rock-b'); await vi.advanceTimersByTimeAsync(10); });
    expect(addNote).toHaveBeenCalledWith({ rockId: 'rock-a', body: 'typed note for a', meetingId: 'm1', source: 'typed' });
  });

  it('with nothing written, moving on saves nothing', async () => {
    const { result } = setup();
    act(() => result.current.retarget('rock-a'));
    await act(async () => { result.current.retarget('rock-b'); await vi.advanceTimersByTimeAsync(10); });
    expect(addNote).not.toHaveBeenCalled();
  });

  it('at the wrap-up (no Rock) the last note is saved and the microphone turns off', async () => {
    const { result } = setup();
    act(() => result.current.retarget('rock-a'));
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('last note'));
    await act(async () => { result.current.retarget(null); await vi.advanceTimersByTimeAsync(50); });
    expect(addNote).toHaveBeenCalledWith(expect.objectContaining({ rockId: 'rock-a', body: 'Last note' }));
    expect(result.current.isRecording).toBe(false);
    expect(result.current.activeRockId).toBeNull();
  });

  it('confirms a save briefly, then clears the confirmation', async () => {
    const { result } = setup();
    act(() => result.current.setDraft('rock-a', 'a note'));
    await act(async () => { await result.current.saveDraft('rock-a'); });
    expect(result.current.lastSaved?.rockId).toBe('rock-a');
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(result.current.lastSaved).toBeNull();
  });

  it('REPRO: a phrase the browser finishes after Next belongs to the Rock you left, not the next one', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('first thing about A'));
    const session = mic();
    session.stop = () => {
      // The browser delivers the phrase it was still recognising a moment after stop, then ends.
      setTimeout(() => {
        session.say('and the tail of A');
        session.started = false;
        session.onend?.();
      }, 150);
    };
    await act(async () => {
      result.current.retarget('rock-b');
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(addNote).toHaveBeenCalledWith(expect.objectContaining({ rockId: 'rock-a', body: 'First thing about A and the tail of A', source: 'dictated' }));
    expect(result.current.getDraft('rock-b')).toBe('');
  });

  it('Stop, then Next before the session has ended: the microphone stays off, the Rock left is saved, the next Rock gets nothing', async () => {
    const { result } = setup();
    act(() => result.current.retarget('rock-a'));
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('note for a'));
    const session = mic();
    session.stop = () => { setTimeout(() => { session.say('tail of a'); session.started = false; session.onend?.(); }, 300); };
    act(() => result.current.stopMic());
    act(() => result.current.retarget('rock-b'));
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(result.current.isRecording).toBe(false);
    expect(result.current.activeRockId).toBeNull();
    expect(addNote).toHaveBeenCalledWith(expect.objectContaining({ rockId: 'rock-a', body: 'Note for a tail of a' }));
    expect(result.current.getDraft('rock-b')).toBe('');
  });

  it('Stop, then Dictate again on the same Rock before the session has ended, restarts it without saving', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('note for a'));
    const session = mic();
    session.stop = () => { setTimeout(() => { session.started = false; session.onend?.(); }, 300); };
    act(() => result.current.stopMic());
    act(() => result.current.startFor('rock-a'));
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(addNote).not.toHaveBeenCalled();
    expect(result.current.activeRockId).toBe('rock-a');
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(result.current.getDraft('rock-a')).toBe('Note for a');
  });
});

