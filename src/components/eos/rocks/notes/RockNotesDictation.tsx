import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useAddRockNote } from '@/hooks/useRockNotes';
import { appendDictation } from '@/lib/dictation';

export interface RockNotesDictationValue {
  meetingId: string | undefined;
  isSupported: boolean;
  isRecording: boolean;
  interimTranscript: string;
  /** The Rock the microphone is currently writing to, or null when it is off. */
  activeRockId: string | null;
  getDraft: (rockId: string) => string;
  setDraft: (rockId: string, text: string) => void;
  /** Turn the microphone on for this Rock. If it is already on for another Rock, it moves here. */
  startFor: (rockId: string) => void;
  /** Turn the microphone off. What was dictated stays in the draft until it is added. */
  stopMic: () => void;
  /** The Rock on screen changed. If the microphone is on it follows, and the Rock it leaves is saved. */
  retarget: (rockId: string) => void;
  /** Save the draft for a Rock as a note. Resolves true when nothing is left unsaved. */
  saveDraft: (rockId: string) => Promise<boolean>;
  /** Stop the microphone and save every draft. Used when the view closes. */
  flushAll: () => Promise<void>;
  isSaving: (rockId: string) => boolean;
  /** Suggested To-Dos already created from a summary, so they cannot be created twice. */
  createdTodoKeys: ReadonlySet<string>;
  markTodoCreated: (key: string) => void;
}

/** How long closing the view waits for the microphone to finish its last phrase before saving. */
const FLUSH_WAIT_MS = 2000;

const Context = createContext<RockNotesDictationValue | null>(null);

/** The notes controller, or null when there is no provider (the Rock panel then supplies its own). */
export const useOptionalRockNotesDictation = () => useContext(Context);

export function useRockNotesDictation(): RockNotesDictationValue {
  const value = useContext(Context);
  if (!value) throw new Error('useRockNotesDictation must be used inside RockNotesDictationProvider');
  return value;
}

/**
 * One microphone and one set of note drafts for everything that shows Rock notes at the same
 * time: the Discuss slide, the Rock details panel opened over it, and the next Rock. Because it
 * sits above all of them, opening the panel or moving between Rocks never restarts the microphone
 * or loses text. The microphone writes to whichever Rock is current when a phrase arrives; moving
 * to another Rock saves the one it leaves, so nothing is lost and nothing lands on the wrong Rock.
 */
export function RockNotesDictationProvider({ meetingId, children }: { meetingId?: string; children: ReactNode }) {
  const { isRecording, isSupported, interimTranscript, startRecording, stopRecording } = useSpeechToText();
  const addNote = useAddRockNote();
  const addNoteRef = useRef(addNote.mutateAsync);
  addNoteRef.current = addNote.mutateAsync;
  const meetingIdRef = useRef(meetingId);
  meetingIdRef.current = meetingId;
  const recordingRef = useRef(isRecording);
  recordingRef.current = isRecording;

  const draftsRef = useRef<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const dictatedRef = useRef<Set<string>>(new Set());
  const savingRef = useRef<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set());
  const activeRef = useRef<string | null>(null);
  const [activeRockId, setActiveRockId] = useState<string | null>(null);
  const [createdTodoKeys, setCreatedTodoKeys] = useState<ReadonlySet<string>>(new Set());

  const writeDraft = useCallback((rockId: string, next: string) => {
    draftsRef.current = { ...draftsRef.current, [rockId]: next };
    setDrafts(draftsRef.current);
  }, []);

  // Saves for one Rock run strictly one after another. A save requested while another is in
  // flight waits for it, then re-reads the draft, so text added meanwhile is saved by the second
  // call and the same text can never be sent twice.
  const saveTailRef = useRef<Map<string, Promise<boolean>>>(new Map());

  const saveNow = useCallback(async (rockId: string): Promise<boolean> => {
    const sent = draftsRef.current[rockId] ?? '';
    const body = sent.trim();
    if (!body) return true;
    savingRef.current.add(rockId);
    setSavingIds(new Set(savingRef.current));
    const source = dictatedRef.current.has(rockId) ? 'dictated' : 'typed';
    try {
      await addNoteRef.current({ rockId, body, meetingId: meetingIdRef.current, source });
      // Keep anything typed or dictated while the save was in flight.
      const current = draftsRef.current[rockId] ?? '';
      const remaining = current.startsWith(sent) ? current.slice(sent.length).trim() : current;
      writeDraft(rockId, remaining);
      if (!remaining) dictatedRef.current.delete(rockId);
      return !remaining;
    } catch {
      // The mutation has already said what went wrong; the draft stays so nothing is lost.
      return false;
    } finally {
      savingRef.current.delete(rockId);
      setSavingIds(new Set(savingRef.current));
    }
  }, [writeDraft]);

  const saveDraft = useCallback((rockId: string): Promise<boolean> => {
    const previous = saveTailRef.current.get(rockId) ?? Promise.resolve(true);
    const next = previous.then(() => saveNow(rockId));
    saveTailRef.current.set(rockId, next);
    void next.finally(() => {
      if (saveTailRef.current.get(rockId) === next) saveTailRef.current.delete(rockId);
    });
    return next;
  }, [saveNow]);

  const startFor = useCallback((rockId: string) => {
    if (recordingRef.current && activeRef.current === rockId) return;
    if (recordingRef.current && activeRef.current) {
      // Already listening for another Rock: keep the same session and just point it here.
      const previous = activeRef.current;
      activeRef.current = rockId;
      setActiveRockId(rockId);
      void saveDraft(previous);
      return;
    }
    activeRef.current = rockId;
    setActiveRockId(rockId);
    startRecording(
      text => {
        const target = activeRef.current;
        if (!target) return;
        dictatedRef.current.add(target);
        writeDraft(target, appendDictation(draftsRef.current[target] ?? '', text));
      },
      { keepListening: true },
    );
  }, [saveDraft, startRecording, writeDraft]);

  const stopMic = useCallback(() => {
    // The target is kept until the session really ends, so the phrase the browser is still
    // finishing lands in the right draft.
    stopRecording();
  }, [stopRecording]);

  const retarget = useCallback((rockId: string) => {
    const previous = activeRef.current;
    if (!recordingRef.current || !previous || previous === rockId) return;
    activeRef.current = rockId;
    setActiveRockId(rockId);
    void saveDraft(previous);
  }, [saveDraft]);

  // The session ended (stopped, or the browser could not keep going): nothing is writing any more.
  useEffect(() => {
    if (!isRecording && activeRef.current) {
      activeRef.current = null;
      setActiveRockId(null);
    }
  }, [isRecording]);

  const unmountedRef = useRef(false);

  const flushAll = useCallback(async () => {
    stopRecording();
    // The browser delivers the phrase it is still recognising after stop, so the draft is only
    // complete once the session has really ended. Wait for that (bounded) before saving.
    const deadline = Date.now() + FLUSH_WAIT_MS;
    while (recordingRef.current && !unmountedRef.current && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await Promise.all(Object.keys(draftsRef.current).map(id => saveDraft(id)));
  }, [saveDraft, stopRecording]);

  // Leaving the meeting with text still in a draft: try to save it rather than drop it.
  const flushRef = useRef(flushAll);
  flushRef.current = flushAll;
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      void flushRef.current();
    };
  }, []);

  const value = useMemo<RockNotesDictationValue>(() => ({
    meetingId,
    isSupported,
    isRecording,
    interimTranscript,
    activeRockId,
    getDraft: rockId => drafts[rockId] ?? '',
    setDraft: writeDraft,
    startFor,
    stopMic,
    retarget,
    saveDraft,
    flushAll,
    isSaving: rockId => savingIds.has(rockId),
    createdTodoKeys,
    markTodoCreated: key => setCreatedTodoKeys(current => new Set(current).add(key)),
  }), [meetingId, isSupported, isRecording, interimTranscript, activeRockId, drafts, writeDraft, startFor, stopMic, retarget, saveDraft, flushAll, savingIds, createdTodoKeys]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
