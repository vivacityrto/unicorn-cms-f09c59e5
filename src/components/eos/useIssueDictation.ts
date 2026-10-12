import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { appendDictation } from '@/lib/dictation';

export type DictationField = 'notes' | 'solution';

const AUTOSAVE_AFTER_MS = 3000;
const AUTOSTART_KEY = 'eos-ids-dictation-autostart';

const TAB_FOR_FIELD: Record<DictationField, string> = { notes: 'discuss', solution: 'solve' };

function readAutoStart(): boolean {
  try {
    return localStorage.getItem(AUTOSTART_KEY) === '1';
  } catch {
    return false;
  }
}

interface Options {
  open: boolean;
  activeTab: string;
  issueId?: string;
  issueStatus?: string;
  /** Current text of each dictatable field (used to autosave while dictating). */
  notes: string;
  solution: string;
  /** Adds a dictated chunk to the field. */
  addText: (field: DictationField, update: (existing: string) => string) => void;
  /** Saves the field if it changed. Must be safe to call repeatedly. */
  save: (field: DictationField) => Promise<void>;
}

/**
 * Hands-free dictation for the IDS dialog's notes and solution fields: keeps listening across
 * pauses, appends text as it is recognised, autosaves every few seconds while dictating, and
 * stops (saving first) when the dialog closes or the user leaves the tab. It hears the user's
 * own microphone only - on a remote call each person dictates their own part.
 */
export function useIssueDictation({ open, activeTab, issueId, issueStatus, notes, solution, addText, save }: Options) {
  const { isRecording, isSupported, interimTranscript, startRecording, stopRecording } = useSpeechToText();
  const [field, setField] = useState<DictationField | null>(null);
  const [autoStart, setAutoStartState] = useState(readAutoStart);
  const saveRef = useRef(save);
  saveRef.current = save;
  const inFlightSave = useRef<Promise<void> | null>(null);
  const autoStartedFor = useRef<string | null>(null);

  const runSave = useCallback((target: DictationField) => {
    const previous = inFlightSave.current ?? Promise.resolve();
    // One save at a time: a second save started before the first finishes would be compared
    // against a stale baseline and look like someone else's edit.
    const next = previous.catch(() => undefined).then(() => saveRef.current(target));
    inFlightSave.current = next;
    return next;
  }, []);

  const stop = useCallback(async () => {
    const stopping = field;
    stopRecording();
    setField(null);
    if (stopping) await runSave(stopping).catch(() => undefined);
  }, [field, runSave, stopRecording]);

  const start = useCallback(
    (target: DictationField) => {
      if (field && field !== target) void runSave(field).catch(() => undefined);
      startRecording((text) => addText(target, (existing) => appendDictation(existing, text)), {
        keepListening: true,
      });
      setField(target);
    },
    [addText, field, runSave, startRecording],
  );

  const toggle = useCallback(
    (target: DictationField) => {
      if (field === target) void stop();
      else start(target);
    },
    [field, start, stop],
  );

  const setAutoStart = useCallback((value: boolean) => {
    setAutoStartState(value);
    try {
      localStorage.setItem(AUTOSTART_KEY, value ? '1' : '0');
    } catch {
      // Preference just will not persist.
    }
  }, []);

  // Autosave while dictating, a few seconds after the text stops changing.
  useEffect(() => {
    if (!field) return;
    const timer = setTimeout(() => void runSave(field).catch(() => undefined), AUTOSAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [field, notes, solution, runSave]);

  // Dictation ended on its own (microphone blocked, browser gave up): save what we have.
  useEffect(() => {
    if (field && !isRecording) {
      setField(null);
      void runSave(field).catch(() => undefined);
    }
  }, [field, isRecording, runSave]);

  // Stop (and save) when the dialog closes or the user moves to a tab without the field.
  useEffect(() => {
    if (field && (!open || activeTab !== TAB_FOR_FIELD[field])) void stop();
  }, [open, activeTab, field, stop]);

  // Opt-in: start dictating notes when an issue is being discussed. Once per opening.
  useEffect(() => {
    if (!open) {
      autoStartedFor.current = null;
      return;
    }
    if (
      autoStart &&
      isSupported &&
      issueId &&
      issueStatus === 'Discussing' &&
      activeTab === 'discuss' &&
      !field &&
      autoStartedFor.current !== issueId
    ) {
      autoStartedFor.current = issueId;
      start('notes');
    }
  }, [open, autoStart, isSupported, issueId, issueStatus, activeTab, field, start]);

  return {
    field,
    interim: interimTranscript,
    isSupported,
    autoStart,
    setAutoStart,
    toggle,
    /** Stops dictating and resolves once the dictated text has been saved. */
    stop,
  };
}
