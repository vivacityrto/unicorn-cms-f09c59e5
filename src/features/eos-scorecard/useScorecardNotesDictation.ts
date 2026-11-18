import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { appendDictation } from '@/lib/dictation';
import { useSaveScorecardNote, type ScorecardNote } from './useScorecardDiscussion';

export interface ScorecardNotesDictationValue {
  meetingId: string | undefined;
  isSupported: boolean;
  isRecording: boolean;
  interimTranscript: string;
  /** The area the microphone is writing to right now, or null when it is off. */
  activeCategory: string | null;
  /** Set while the microphone hands over to another area: the area being finished. */
  handingOverFrom: string | null;
  /** The most recent note saved, for a short confirmation. Cleared after a few seconds. */
  lastSaved: { category: string; at: number } | null;
  getDraft: (category: string) => string;
  setDraft: (category: string, text: string) => void;
  /** Something typed or dictated that is not saved yet. */
  isDirty: (category: string) => boolean;
  isSaving: (category: string) => boolean;
  startFor: (category: string) => void;
  stopMic: () => void;
  /**
   * The area on screen changed (null: none, as at the wrap-up). If the microphone is on, the area being left
   * receives everything said up to now and is saved, then the microphone starts for the new area. If it is
   * off, the note being written for the area being left is saved.
   */
  retarget: (category: string | null) => void;
  saveDraft: (category: string) => Promise<boolean>;
  /** Stop the microphone and save every draft. Used when the view closes. */
  flushAll: () => Promise<void>;
}

/** How long closing the view waits for the microphone to finish its last phrase before saving. */
const FLUSH_WAIT_MS = 2000;

export const ScorecardNotesDictationContext = createContext<ScorecardNotesDictationValue | null>(null);

/** The controller, or null outside a meeting deck. */
export const useOptionalScorecardNotesDictation = () => useContext(ScorecardNotesDictationContext);

/**
 * One microphone and one set of note drafts for the whole scorecard deck. It sits above every slide, so moving to
 * the next area never restarts the microphone or loses text. Moving on is a hand-over: the area being left keeps the
 * microphone until the browser has delivered its last phrase and the note is saved; only then does a fresh session
 * start for the next area. Saving replaces the person's note for that area, and the draft starts from that note, so
 * dictating adds to what is already there.
 */
export function useScorecardNotesDictation(meetingId: string | undefined, notes: readonly ScorecardNote[], myUserId: string | null): ScorecardNotesDictationValue {
  const { isRecording, isSupported, interimTranscript, startRecording, stopRecording } = useSpeechToText();
  const save = useSaveScorecardNote(meetingId);
  const saveRef = useRef(save.mutateAsync);
  saveRef.current = save.mutateAsync;
  const recordingRef = useRef(isRecording);
  recordingRef.current = isRecording;

  // What is already saved for this person, by area. A save updates it straight away, before the list refetches.
  const savedFromServer = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of notes) if (n.createdBy === myUserId) map[n.category] = n.body;
    return map;
  }, [notes, myUserId]);
  const savedRef = useRef<Record<string, string>>({});
  const [justSaved, setJustSaved] = useState<Record<string, string>>({});
  const savedBody = useCallback((category: string) => justSaved[category] ?? savedFromServer[category] ?? '', [justSaved, savedFromServer]);

  const draftsRef = useRef<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const savingRef = useRef<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set());
  const activeRef = useRef<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const screenRef = useRef<string | null>(null);
  // undefined = no hand-over; a category = start there when the session ends; null = turn the microphone off.
  const handOverRef = useRef<string | null | undefined>(undefined);
  const stopPendingRef = useRef(false);
  const [handingOverFrom, setHandingOverFrom] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<{ category: string; at: number } | null>(null);
  const lastSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writeDraft = useCallback((category: string, next: string) => {
    draftsRef.current = { ...draftsRef.current, [category]: next };
    setDrafts(draftsRef.current);
  }, []);

  /** The draft as it stands: what was typed or dictated, or the saved note when nothing has been touched. */
  const currentDraft = useCallback((category: string) => draftsRef.current[category] ?? savedRef.current[category] ?? '', []);
  savedRef.current = { ...savedFromServer, ...justSaved };

  const saveTailRef = useRef<Map<string, Promise<boolean>>>(new Map());

  const saveNow = useCallback(async (category: string): Promise<boolean> => {
    const sent = currentDraft(category).trim();
    if (!sent || sent === (savedRef.current[category] ?? '')) return true;
    savingRef.current.add(category);
    setSavingIds(new Set(savingRef.current));
    try {
      await saveRef.current({ category, body: sent });
      setJustSaved((current) => ({ ...current, [category]: sent }));
      setLastSaved({ category, at: Date.now() });
      if (lastSavedTimerRef.current) clearTimeout(lastSavedTimerRef.current);
      lastSavedTimerRef.current = setTimeout(() => setLastSaved(null), 4000);
      return currentDraft(category).trim() === sent;
    } catch {
      // The mutation has already said what went wrong; the draft stays so nothing is lost.
      return false;
    } finally {
      savingRef.current.delete(category);
      setSavingIds(new Set(savingRef.current));
    }
  }, [currentDraft]);

  // Saves for one area run one after another, so the same text is never sent twice and text added meanwhile is kept.
  const saveDraft = useCallback((category: string): Promise<boolean> => {
    const previous = saveTailRef.current.get(category) ?? Promise.resolve(true);
    const next = previous.then(() => saveNow(category));
    saveTailRef.current.set(category, next);
    void next.finally(() => {
      if (saveTailRef.current.get(category) === next) saveTailRef.current.delete(category);
    });
    return next;
  }, [saveNow]);

  const onSpeech = useCallback((text: string) => {
    const target = activeRef.current;
    if (!target) return;
    writeDraft(target, appendDictation(currentDraft(target), text));
  }, [writeDraft, currentDraft]);

  const begin = useCallback((category: string) => {
    activeRef.current = category;
    setActiveCategory(category);
    startRecording(onSpeech, { keepListening: true });
  }, [onSpeech, startRecording]);

  const handOver = useCallback((to: string | null, explicit = false) => {
    if (explicit) stopPendingRef.current = false;
    const destination = !explicit && stopPendingRef.current ? null : to;
    if (handOverRef.current === undefined) {
      setHandingOverFrom(activeRef.current);
      handOverRef.current = destination;
      stopRecording();
    } else {
      handOverRef.current = destination;
    }
  }, [stopRecording]);

  const startFor = useCallback((category: string) => {
    if (recordingRef.current && activeRef.current) {
      if (handOverRef.current === undefined && !stopPendingRef.current && activeRef.current === category) return;
      handOver(category, true);
      return;
    }
    begin(category);
  }, [begin, handOver]);

  const stopMic = useCallback(() => {
    if (recordingRef.current) stopPendingRef.current = true;
    if (handOverRef.current !== undefined) handOverRef.current = null;
    stopRecording();
  }, [stopRecording]);

  const retarget = useCallback((next: string | null) => {
    const left = screenRef.current;
    screenRef.current = next;
    if (recordingRef.current && activeRef.current) {
      if (stopPendingRef.current) {
        if (handOverRef.current === undefined) setHandingOverFrom(activeRef.current);
        handOverRef.current = null;
        return;
      }
      if (handOverRef.current === undefined && activeRef.current === next) return;
      handOver(next);
      return;
    }
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
      setActiveCategory(null);
      return;
    }
    if (pending !== ended) void saveDraft(ended);
    if (pending) begin(pending);
    else {
      activeRef.current = null;
      setActiveCategory(null);
    }
  }, [isRecording, begin, saveDraft]);

  const unmountedRef = useRef(false);

  const flushAll = useCallback(async () => {
    if (handOverRef.current !== undefined) handOverRef.current = null;
    else if (recordingRef.current) stopPendingRef.current = true;
    screenRef.current = null;
    stopRecording();
    const deadline = Date.now() + FLUSH_WAIT_MS;
    while (recordingRef.current && !unmountedRef.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await Promise.all(Object.keys(draftsRef.current).map((category) => saveDraft(category)));
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

  return useMemo<ScorecardNotesDictationValue>(() => ({
    meetingId,
    isSupported,
    isRecording,
    interimTranscript,
    activeCategory,
    handingOverFrom,
    lastSaved,
    getDraft: (category) => drafts[category] ?? savedBody(category),
    setDraft: writeDraft,
    isDirty: (category) => (drafts[category] ?? savedBody(category)).trim() !== savedBody(category),
    isSaving: (category) => savingIds.has(category),
    startFor,
    stopMic,
    retarget,
    saveDraft,
    flushAll,
  }), [meetingId, isSupported, isRecording, interimTranscript, activeCategory, handingOverFrom, lastSaved, drafts, savedBody, writeDraft, savingIds, startFor, stopMic, retarget, saveDraft, flushAll]);
}
