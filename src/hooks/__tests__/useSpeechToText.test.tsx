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
});
