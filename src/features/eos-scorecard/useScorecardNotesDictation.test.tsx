import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const speech = vi.hoisted(() => ({
  isRecording: false,
  onResult: null as null | ((text: string) => void),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
}));
const saveNote = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/hooks/useSpeechToText', () => ({
  useSpeechToText: () => ({
    isRecording: speech.isRecording,
    isSupported: true,
    interimTranscript: '',
    startRecording: (cb: (text: string) => void) => {
      speech.onResult = cb;
      speech.isRecording = true;
      speech.startRecording();
    },
    stopRecording: () => {
      speech.stopRecording();
    },
  }),
}));
vi.mock('./useScorecardDiscussion', () => ({
  useSaveScorecardNote: () => ({ mutateAsync: saveNote }),
}));

import { useScorecardNotesDictation } from './useScorecardNotesDictation';

const noNotes: never[] = [];

describe('scorecard notes dictation', () => {
  beforeEach(() => {
    speech.isRecording = false;
    speech.onResult = null;
    speech.startRecording.mockClear();
    speech.stopRecording.mockClear();
    saveNote.mockClear();
  });

  it('starts from the note already saved, so dictating adds to it', () => {
    const notes = [{ id: 'n1', category: 'a', body: 'Agreed to call.', createdBy: 'me', updatedAt: '' }];
    const { result } = renderHook(() => useScorecardNotesDictation('m1', notes, 'me'));
    expect(result.current.getDraft('a')).toBe('Agreed to call.');
    expect(result.current.isDirty('a')).toBe(false);
  });

  it('puts dictated words in the area that owns the microphone and saves them when Next is pressed with the microphone off', async () => {
    const { result } = renderHook(() => useScorecardNotesDictation('m1', noNotes, 'me'));
    act(() => result.current.retarget('a'));
    act(() => result.current.setDraft('a', 'Typed note'));
    expect(result.current.isDirty('a')).toBe(true);
    act(() => result.current.retarget('b'));
    await waitFor(() => expect(saveNote).toHaveBeenCalledWith({ category: 'a', body: 'Typed note' }));
    await waitFor(() => expect(result.current.isDirty('a')).toBe(false));
  });

  it('does not save an unchanged note again', async () => {
    const notes = [{ id: 'n1', category: 'a', body: 'Same.', createdBy: 'me', updatedAt: '' }];
    const { result } = renderHook(() => useScorecardNotesDictation('m1', notes, 'me'));
    act(() => result.current.retarget('a'));
    act(() => result.current.retarget('b'));
    await act(async () => {
      await result.current.saveDraft('a');
    });
    expect(saveNote).not.toHaveBeenCalled();
  });

  it('listens for the area it is started on and records what is said there', () => {
    const { result } = renderHook(() => useScorecardNotesDictation('m1', noNotes, 'me'));
    act(() => result.current.retarget('a'));
    act(() => result.current.startFor('a'));
    expect(speech.startRecording).toHaveBeenCalledTimes(1);
    act(() => speech.onResult?.('we should ring them'));
    expect(result.current.getDraft('a')).toBe('We should ring them');
    expect(result.current.getDraft('b')).toBe('');
  });
});
