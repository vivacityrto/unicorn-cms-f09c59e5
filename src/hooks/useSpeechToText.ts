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

  const isSupported = typeof window !== 'undefined' && getSpeechRecognitionClass() !== null;

  const stopRecording = useCallback(() => {
    wantListeningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    } else {
      setIsRecording(false);
      setInterimTranscript('');
    }
  }, []);

  const beginSession = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'en-AU';
    recognition.interimResults = true;
    recognition.continuous = keepListeningRef.current;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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
      recognitionRef.current = null;
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
      // start() throws if a session is already starting; the running one carries on.
    }
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
      wantListeningRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }

      onResultRef.current = onResult;
      keepListeningRef.current = options?.keepListening ?? false;
      wantListeningRef.current = true;
      restartTimesRef.current = [];
      lastResultAtRef.current = Date.now();
      beginSession();
      setIsRecording(true);
    },
    [beginSession],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
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
