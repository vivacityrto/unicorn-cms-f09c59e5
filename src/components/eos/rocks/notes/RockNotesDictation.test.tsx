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

  it('keeps one live microphone when moving to the next Rock, saves the Rock it leaves, and writes new phrases to the new Rock', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('about the first rock'));

    await act(async () => result.current.retarget('rock-b'));
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(addNote).toHaveBeenCalledWith({ rockId: 'rock-a', body: 'About the first rock', meetingId: 'm1', source: 'dictated' });

    act(() => mic().say('about the second rock'));
    expect(result.current.getDraft('rock-b')).toBe('About the second rock');
    expect(result.current.getDraft('rock-a')).toBe('');
    expect(result.current.activeRockId).toBe('rock-b');

    expect(FakeRecognition.instances).toHaveLength(1);
    expect(FakeRecognition.instances.filter(i => i.started)).toHaveLength(1);
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

  it('pressing Dictate on another Rock while listening moves the same session there', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('for a'));
    await act(async () => result.current.startFor('rock-b'));
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(result.current.activeRockId).toBe('rock-b');
    expect(addNote).toHaveBeenCalledWith(expect.objectContaining({ rockId: 'rock-a', body: 'For a' }));
  });

  it('closing while a phrase is still being recognised saves that phrase too', async () => {
    const { result } = setup();
    act(() => result.current.startFor('rock-a'));
    act(() => mic().say('already heard'));
    const session = mic();
    session.stop = () => {
      // The browser finishes the phrase a moment after stop, then ends the session.
      setTimeout(() => {
        session.say('and the last words');
        session.started = false;
        session.onend?.();
      }, 100);
    };
    await act(async () => {
      const flushing = result.current.flushAll();
      await vi.advanceTimersByTimeAsync(2500);
      await flushing;
    });
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(addNote).toHaveBeenCalledWith(expect.objectContaining({ rockId: 'rock-a', body: 'Already heard and the last words' }));
    expect(result.current.getDraft('rock-a')).toBe('');
  });

  it('closing during a save also saves the text added while it was in flight', async () => {
    const { result } = setup();
    const finishers: Array<() => void> = [];
    addNote.mockImplementation(() => new Promise(resolve => { finishers.push(() => resolve({ note_id: 'n', created_at: 'x', duplicate: false })); }));

    act(() => result.current.setDraft('rock-a', 'first part'));
    act(() => void result.current.saveDraft('rock-a'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    act(() => result.current.setDraft('rock-a', 'first part and a second part'));

    let flushing: Promise<void> = Promise.resolve();
    act(() => { flushing = result.current.flushAll(); });
    await act(async () => { finishers[0](); await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { finishers[1]?.(); await flushing; });

    expect(addNote.mock.calls.map(call => call[0].body)).toEqual(['first part', 'and a second part']);
    expect(result.current.getDraft('rock-a')).toBe('');
  });
});

