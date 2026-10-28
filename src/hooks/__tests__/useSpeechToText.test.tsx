/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { toast } from '@/hooks/use-toast';
import { useSpeechToText } from '@/hooks/useSpeechToText';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  /** Real browsers fire onend for an aborted session a moment later, not synchronously. */
  pendingEnd = false;
  startThrows = false;
  stopFiresEnd = true;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    if (this.startThrows) throw new Error('InvalidStateError');
    this.started = true;
  }
  stop() {
    this.started = false;
    if (this.stopFiresEnd) this.onend?.();
  }
  abort() {
    this.started = false;
    this.pendingEnd = true;
  }
  /** The late onend/onerror a browser delivers for a session that was aborted. */
  deliverLateEvents() {
    if (!this.pendingEnd) return;
    this.pendingEnd = false;
    this.onerror?.({ error: 'aborted' });
    this.onend?.();
  }
  /** The browser ending the session by itself (pause, ~1 minute limit, ...). */
  browserEnds() {
    this.started = false;
    this.onend?.();
  }
  say(text: string, isFinal = true) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] });
  }
}

const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
});

describe('useSpeechToText', () => {
  it('default mode: one phrase, then it stops (unchanged behaviour for the note dialogs)', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(onResult));

    expect(latest().continuous).toBe(false);
    act(() => latest().say('hello'));
    expect(onResult).toHaveBeenCalledWith('hello');

    act(() => latest().browserEnds());
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.isRecording).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it('keep-listening mode: restarts by itself when the browser ends the session', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(onResult, { keepListening: true }));
    expect(latest().continuous).toBe(true);

    act(() => latest().browserEnds());
    expect(result.current.isRecording).toBe(true); // still on while it restarts
    act(() => void vi.advanceTimersByTime(300));

    expect(FakeRecognition.instances).toHaveLength(2);
    expect(latest().started).toBe(true);

    act(() => latest().say('second phrase'));
    expect(onResult).toHaveBeenCalledWith('second phrase');
  });

  it('keep-listening mode: pressing stop ends it for good', () => {
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(vi.fn(), { keepListening: true }));

    act(() => result.current.stopRecording());
    act(() => void vi.advanceTimersByTime(1000));

    expect(result.current.isRecording).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it('keep-listening mode: stop pressed during the restart gap prevents the restart', () => {
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(vi.fn(), { keepListening: true }));

    act(() => latest().browserEnds());
    act(() => result.current.stopRecording());
    act(() => void vi.advanceTimersByTime(1000));

    expect(result.current.isRecording).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it('keep-listening mode: a quiet moment (no-speech) does not stop it', () => {
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(vi.fn(), { keepListening: true }));

    act(() => latest().onerror?.({ error: 'no-speech' }));
    act(() => latest().browserEnds());
    act(() => void vi.advanceTimersByTime(300));

    expect(result.current.isRecording).toBe(true);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(toast).not.toHaveBeenCalled();
  });

  it('a blocked microphone stops it and says so', () => {
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(vi.fn(), { keepListening: true }));

    act(() => latest().onerror?.({ error: 'not-allowed' }));
    act(() => latest().browserEnds());
    act(() => void vi.advanceTimersByTime(1000));

    expect(result.current.isRecording).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Microphone blocked' }));
  });

  it('gives up after repeated restarts that never produce any text', () => {
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(vi.fn(), { keepListening: true }));

    for (let i = 0; i < 6; i++) {
      act(() => latest().browserEnds());
      act(() => void vi.advanceTimersByTime(300));
    }

    expect(result.current.isRecording).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dictation stopped' }));
  });

  it('does not give up while text keeps coming in', () => {
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(vi.fn(), { keepListening: true }));

    for (let i = 0; i < 8; i++) {
      act(() => latest().say('words'));
      act(() => latest().browserEnds());
      act(() => void vi.advanceTimersByTime(1000));
    }

    expect(result.current.isRecording).toBe(true);
  });

  it('switching to a new target leaves exactly one live session, and stop ends it', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(first, { keepListening: true }));
    const old = latest();
    act(() => result.current.startRecording(second, { keepListening: true }));
    const current = latest();

    // The browser reports the first session as aborted after the second has started.
    act(() => old.deliverLateEvents());
    act(() => void vi.advanceTimersByTime(1000));

    expect(FakeRecognition.instances).toHaveLength(2); // no third session was spawned
    expect(FakeRecognition.instances.filter(i => i.started)).toHaveLength(1);
    expect(result.current.isRecording).toBe(true);

    act(() => current.say('to the second'));
    expect(second).toHaveBeenCalledWith('to the second');
    expect(first).not.toHaveBeenCalled();

    act(() => result.current.stopRecording());
    act(() => void vi.advanceTimersByTime(2000));
    expect(FakeRecognition.instances.filter(i => i.started)).toHaveLength(0);
    expect(result.current.isRecording).toBe(false);
  });

  it('text from a discarded session never reaches the new callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(first, { keepListening: true }));
    const old = latest();
    act(() => result.current.startRecording(second, { keepListening: true }));

    act(() => old.say('late words'));
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('stop forces the session off when the browser never confirms the end', () => {
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(vi.fn(), { keepListening: true }));
    latest().stopFiresEnd = false;

    act(() => result.current.stopRecording());
    expect(result.current.isRecording).toBe(true); // waiting for the browser
    act(() => void vi.advanceTimersByTime(2000));

    expect(result.current.isRecording).toBe(false);
    expect(latest().pendingEnd).toBe(true); // it was aborted, not left running
  });

  it('a start() the browser refuses is not shown as listening (single-phrase mode)', () => {
    class Refusing extends FakeRecognition {
      startThrows = true;
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = Refusing;
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(vi.fn()));
    expect(result.current.isRecording).toBe(false);
  });

  it('a refused start() in keep-listening mode is retried once the browser is free', () => {
    const { result } = renderHook(() => useSpeechToText());
    const originalStart = FakeRecognition.prototype.start;
    let calls = 0;
    FakeRecognition.prototype.start = function (this: FakeRecognition) {
      calls++;
      if (calls === 1) throw new Error('InvalidStateError');
      return originalStart.call(this);
    };
    try {
      act(() => result.current.startRecording(vi.fn(), { keepListening: true }));
      act(() => void vi.advanceTimersByTime(600));
      expect(result.current.isRecording).toBe(true);
      expect(latest().started).toBe(true);
    } finally {
      FakeRecognition.prototype.start = originalStart;
    }
  });

  it('gives up, and says so, when the browser keeps refusing to start in keep-listening mode', () => {
    class Refusing extends FakeRecognition {
      startThrows = true;
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = Refusing;
    const { result } = renderHook(() => useSpeechToText());
    act(() => result.current.startRecording(vi.fn(), { keepListening: true }));
    for (let i = 0; i < 10; i++) act(() => void vi.advanceTimersByTime(500));

    expect(result.current.isRecording).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(5); // the first try plus four retries, then it stops
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dictation could not start' }));
  });
});

