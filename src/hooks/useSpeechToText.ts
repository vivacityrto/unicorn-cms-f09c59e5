import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

const getSpeechRecognitionClass = (): (new () => SpeechRecognitionInstance) | null => {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
};

/** How long stop() waits for the browser to confirm the session ended before forcing it. */
const STOP_GRACE_MS = 1500;
/** How many times in a row a refused start() is retried before giving up. */
const MAX_START_RETRIES = 4;

/**
 * Cut a session loose from the hook, then abort it. A browser fires onend/onerror for an
 * aborted session some time later; those late events must not touch whichever session is
 * current by then, so every handler is removed before the abort.
 */
function discard(recognition: SpeechRecognitionInstance) {
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  recognition.onstart = null;
  try {
    recognition.abort();
  } catch {
    // already finished
  }
}

export function useSpeechToText() {
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef<((text: string) => void) | null>(null);
  // Continuous ("keep listening") mode: the browser ends a session after a pause or about a
  // minute, so when the user has not pressed stop we quietly start a fresh one.
  const wantListeningRef = useRef(false);
  const keepListeningRef = useRef(false);
  const restartTimesRef = useRef<number[]>([]);
  const lastResultAtRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startFailuresRef = useRef(0);

  const isSupported = typeof window !== 'undefined' && getSpeechRecognitionClass() !== null;

  const stopRecording = useCallback(() => {
    wantListeningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const current = recognitionRef.current;
    if (current) {
      // stop() lets the browser deliver the phrase it is still working on, then fire onend.
      // If onend never comes the microphone could stay live while the UI says it is off, so
      // after a short grace period the session is cut off and the state reset regardless.
      try {
        current.stop();
      } catch {
        // already finished
      }
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      stopTimerRef.current = setTimeout(() => {
        stopTimerRef.current = null;
        if (recognitionRef.current === current) {
          discard(current);
          recognitionRef.current = null;
          setIsRecording(false);
          setInterimTranscript('');
        }
      }, STOP_GRACE_MS);
    } else {
      setIsRecording(false);
      setInterimTranscript('');
    }
  }, []);

  const beginSession = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) return;

    // Never two live sessions: a second one would double every phrase and could not be stopped.
    if (recognitionRef.current) {
      discard(recognitionRef.current);
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'en-AU';
    recognition.interimResults = true;
    recognition.continuous = keepListeningRef.current;

    // Only the session the hook currently holds may act. Anything else is a leftover.
    const isCurrent = () => recognitionRef.current === recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!isCurrent()) return;
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setInterimTranscript(interim);

      if (final) {
        lastResultAtRef.current = Date.now();
        onResultRef.current?.(final);
        setInterimTranscript('');
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (!isCurrent()) return;
      const fatal =
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed' ||
        event.error === 'audio-capture' ||
        event.error === 'language-not-supported';
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast({
          title: 'Microphone blocked',
          description: 'Please allow microphone access in your browser settings.',
          variant: 'destructive',
        });
      } else if (event.error === 'audio-capture') {
        toast({
          title: 'No microphone found',
          description: 'Check that a microphone is connected and selected.',
          variant: 'destructive',
        });
      } else if ((!keepListeningRef.current || fatal) && event.error !== 'aborted' && event.error !== 'no-speech') {
        toast({
          title: 'Speech error',
          description: `Recognition error: ${event.error}`,
          variant: 'destructive',
        });
      }
      // In keep-listening mode a quiet moment ('no-speech') or a dropped connection is not the
      // end: onend restarts the session. Only fatal errors stop it.
      if (fatal || !keepListeningRef.current) {
        wantListeningRef.current = false;
        setIsRecording(false);
        setInterimTranscript('');
      }
    };

    recognition.onend = () => {
      if (!isCurrent()) return;
      recognitionRef.current = null;
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (wantListeningRef.current && keepListeningRef.current) {
        // Give up if sessions keep dying without producing any text (e.g. no network).
        const now = Date.now();
        restartTimesRef.current = [...restartTimesRef.current.filter((t) => now - t < 10_000), now];
        const stalled =
          restartTimesRef.current.length >= 5 && lastResultAtRef.current <= restartTimesRef.current[0];
        if (stalled) {
          wantListeningRef.current = false;
          setIsRecording(false);
          setInterimTranscript('');
          toast({
            title: 'Dictation stopped',
            description: 'The browser could not keep listening. Check your connection and press the mic to try again.',
            variant: 'destructive',
          });
          return;
        }
        setInterimTranscript('');
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (wantListeningRef.current) beginSession();
        }, 300);
        return;
      }
      setIsRecording(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // start() refused (a session is still winding down, or the browser is busy). Do not
      // leave the UI saying it is listening when nothing is: drop this session and, in
      // keep-listening mode, try again a few times; then give up and say so.
      recognitionRef.current = null;
      startFailuresRef.current += 1;
      if (wantListeningRef.current && keepListeningRef.current && startFailuresRef.current <= MAX_START_RETRIES) {
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (wantListeningRef.current && !recognitionRef.current) beginSession();
        }, 500);
      } else {
        wantListeningRef.current = false;
        setIsRecording(false);
        setInterimTranscript('');
        if (startFailuresRef.current > MAX_START_RETRIES) {
          toast({
            title: 'Dictation could not start',
            description: 'The browser would not start listening. Check the microphone and press the mic to try again.',
            variant: 'destructive',
          });
        }
      }
      return;
    }
    startFailuresRef.current = 0;
  }, []);

  const startRecording = useCallback(
    (onResult: (text: string) => void, options?: { keepListening?: boolean }) => {
      const SpeechRecognitionClass = getSpeechRecognitionClass();
      if (!SpeechRecognitionClass) {
        toast({
          title: 'Not supported',
          description: 'Speech recognition is not available in this browser. Try Chrome or Edge.',
          variant: 'destructive',
        });
        return;
      }

      // Stop any existing session
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      wantListeningRef.current = false;
      if (recognitionRef.current) {
        discard(recognitionRef.current);
        recognitionRef.current = null;
      }

      onResultRef.current = onResult;
      keepListeningRef.current = options?.keepListening ?? false;
      wantListeningRef.current = true;
      restartTimesRef.current = [];
      startFailuresRef.current = 0;
      lastResultAtRef.current = Date.now();
      setIsRecording(true);
      // A refused start() switches it back off inside beginSession, so this must come first.
      beginSession();
    },
    [beginSession],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (recognitionRef.current) {
        discard(recognitionRef.current);
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isRecording,
    isSupported,
    interimTranscript,
    startRecording,
    stopRecording,
  };
}
