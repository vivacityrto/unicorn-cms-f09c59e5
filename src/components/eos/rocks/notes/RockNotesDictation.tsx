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
  /**
   * Set while the microphone is handing over to another Rock: the Rock being finished. Until the
   * browser has delivered its last phrase and the note is saved, that Rock still owns the microphone.
   */
  handingOverFromRockId: string | null;
  /** The most recent note saved from a draft, for a short confirmation. Cleared after a few seconds. */
  lastSaved: { rockId: string; at: number } | null;
  getDraft: (rockId: string) => string;
  setDraft: (rockId: string, text: string) => void;
  /** Turn the microphone on for this Rock. If it is already on for another Rock, it hands over to this one. */
  startFor: (rockId: string) => void;
  /** Turn the microphone off. What was dictated stays in the draft until it is added. */
  stopMic: () => void;
  /**
   * The Rock on screen changed (null: none, as at the wrap-up). If the microphone is on, the Rock
   * being left receives everything said up to now, including the phrase still being recognised, and
   * is saved; then the microphone starts for the new Rock (or turns off for null). If it is off, the
   * note being written for the Rock being left is saved.
   */
  retarget: (rockId: string | null) => void;
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
 * or loses text.
 *
 * Moving to another Rock is a hand-over, not an instant switch. A speech recogniser delivers its last
 * phrase a moment AFTER you stop speaking, so pointing the microphone at the next Rock straight away
 * would put the end of the old note on the new one. Instead the Rock being left keeps the microphone
 * until the browser has really ended the session (which delivers that last phrase), is saved, and only
 * then does a fresh session start for the next Rock.
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
  // The Rock the slide is showing, as last reported by retarget().
  const screenRockRef = useRef<string | null>(null);
  // A hand-over in progress: undefined = none; a Rock id = start there when the session ends;
  // null = turn the microphone off when the session ends.
  const handOverRef = useRef<string | null | undefined>(undefined);
  // The person pressed Stop and the session has not ended yet. Moving to another Rock in that window
  // must not start the microphone again: Stop is explicit.
  const stopPendingRef = useRef(false);
  const [handingOverFrom, setHandingOverFrom] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<{ rockId: string; at: number } | null>(null);
  const lastSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      setLastSaved({ rockId, at: Date.now() });
      if (lastSavedTimerRef.current) clearTimeout(lastSavedTimerRef.current);
      lastSavedTimerRef.current = setTimeout(() => setLastSaved(null), 4000);
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

  // What the microphone does with each phrase: it goes to the Rock that owns the microphone right now.
  const onSpeech = useCallback((text: string) => {
    const target = activeRef.current;
    if (!target) return;
    dictatedRef.current.add(target);
    writeDraft(target, appendDictation(draftsRef.current[target] ?? '', text));
  }, [writeDraft]);

  const begin = useCallback((rockId: string) => {
    activeRef.current = rockId;
    setActiveRockId(rockId);
    startRecording(onSpeech, { keepListening: true });
  }, [onSpeech, startRecording]);

  // Ask the running session to finish. It delivers its last phrase and ends; the effect below then
  // saves the Rock that owned the microphone and carries out whatever comes next.
  const handOver = useCallback((to: string | null, explicit = false) => {
    // Pressing Dictate is an explicit request and overrides an earlier Stop. Navigation is not:
    // once Stop has been pressed the microphone stays off however many times the slide moves.
    if (explicit) stopPendingRef.current = false;
    const destination = !explicit && stopPendingRef.current ? null : to;
    if (handOverRef.current === undefined) {
      setHandingOverFrom(activeRef.current);
      handOverRef.current = destination;
      stopRecording();
    } else {
      // Already handing over (Next pressed again, or Previous): only the destination changes.
      handOverRef.current = destination;
    }
  }, [stopRecording]);

  const startFor = useCallback((rockId: string) => {
    if (recordingRef.current && activeRef.current) {
      // Dictate pressed again right after Stop restarts it; otherwise already listening here is a no-op.
      if (handOverRef.current === undefined && !stopPendingRef.current && activeRef.current === rockId) return;
      handOver(rockId, true);
      return;
    }
    begin(rockId);
  }, [begin, handOver]);

  const stopMic = useCallback(() => {
    // If a hand-over is under way the Rock being finished is still saved, and the microphone then
    // stays off. Otherwise the text stays in the draft for review. Either way the target is kept until
    // the session really ends, so the phrase the browser is still finishing lands in the right draft.
    if (recordingRef.current) stopPendingRef.current = true;
    if (handOverRef.current !== undefined) handOverRef.current = null;
    stopRecording();
  }, [stopRecording]);

  const retarget = useCallback((next: string | null) => {
    const left = screenRockRef.current;
    screenRockRef.current = next;
    if (recordingRef.current && activeRef.current) {
      if (stopPendingRef.current) {
        // Stop was pressed and the session is still finishing its last phrase. Moving on, once or
        // repeatedly, saves the Rock that owns it when it ends, and the microphone stays off.
        if (handOverRef.current === undefined) setHandingOverFrom(activeRef.current);
        handOverRef.current = null;
        return;
      }
      if (handOverRef.current === undefined && activeRef.current === next) return;
      handOver(next);
      return;
    }
    // The microphone is off: Next still saves the note that was being written for the Rock being left.
    if (left && left !== next) void saveDraft(left);
  }, [handOver, saveDraft]);

  // The session ended: stopped, handed over, or the browser could not keep going.
  useEffect(() => {
    if (isRecording) return;
    const ended = activeRef.current;
    const pending = handOverRef.current;
    handOverRef.current = undefined;
    stopPendingRef.current = false;
    setHandingOverFrom(null);
    if (!ended) return;
    if (pending === undefined) {
      activeRef.current = null;
      setActiveRockId(null);
      return;
    }
    // By now the browser has delivered the last phrase, and it went to the Rock that owned the microphone.
    if (pending !== ended) void saveDraft(ended);
    if (pending) begin(pending);
    else {
      activeRef.current = null;
      setActiveRockId(null);
    }
  }, [isRecording, begin, saveDraft]);

  const unmountedRef = useRef(false);

  const flushAll = useCallback(async () => {
    // Closing: finish the Rock that owns the microphone and do not start another session.
    if (handOverRef.current !== undefined) handOverRef.current = null;
    else if (recordingRef.current) stopPendingRef.current = true;
    screenRockRef.current = null;
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
      if (lastSavedTimerRef.current) clearTimeout(lastSavedTimerRef.current);
      void flushRef.current();
    };
  }, []);

  const value = useMemo<RockNotesDictationValue>(() => ({
    meetingId,
    isSupported,
    isRecording,
    interimTranscript,
    activeRockId,
    handingOverFromRockId: handingOverFrom,
    lastSaved,
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
  }), [meetingId, isSupported, isRecording, interimTranscript, activeRockId, handingOverFrom, lastSaved, drafts, writeDraft, startFor, stopMic, retarget, saveDraft, flushAll, savingIds, createdTodoKeys]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
