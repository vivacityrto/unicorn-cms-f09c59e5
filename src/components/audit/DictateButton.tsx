import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DictateButtonProps {
  onTranscript: (text: string) => void;
  appendMode?: boolean;
  lang?: string;
}

// Minimal Web Speech API typings (avoid `any`).
interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  0: SRAlternative;
  [index: number]: SRAlternative;
}
interface SRResultList {
  length: number;
  [index: number]: SRResult;
}
interface SREvent extends Event {
  resultIndex: number;
  results: SRResultList;
}
interface SRErrorEvent extends Event {
  error: string;
  message?: string;
}
interface SRInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SREvent) => void) | null;
  onerror: ((ev: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SRConstructor = new () => SRInstance;

function getSpeechRecognitionCtor(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const SILENCE_MS = 30_000;

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function DictateButton({
  onTranscript,
  appendMode: _appendMode = true,
  lang = 'en-AU',
}: DictateButtonProps) {
  const [supported, setSupported] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [interim, setInterim] = useState<string>('');
  const [elapsed, setElapsed] = useState<number>(0);

  const recognitionRef = useRef<SRInstance | null>(null);
  const tickRef = useRef<number | null>(null);
  const silenceRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  const cleanupTimers = () => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (silenceRef.current !== null) {
      window.clearTimeout(silenceRef.current);
      silenceRef.current = null;
    }
  };

  const stop = () => {
    const r = recognitionRef.current;
    if (r) {
      try {
        r.stop();
      } catch {
        /* noop */
      }
    }
  };

  useEffect(() => {
    return () => {
      cleanupTimers();
      const r = recognitionRef.current;
      if (r) {
        try {
          r.abort();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  const armSilence = () => {
    if (silenceRef.current !== null) window.clearTimeout(silenceRef.current);
    silenceRef.current = window.setTimeout(() => {
      stop();
    }, SILENCE_MS);
  };

  const start = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;

    r.onresult = (ev: SREvent) => {
      let interimText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          const trimmed = transcript.trim();
          if (trimmed) onTranscript(trimmed);
        } else {
          interimText += transcript;
        }
      }
      setInterim(interimText);
      armSilence();
    };

    r.onerror = (ev: SRErrorEvent) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        toast.error(
          'Microphone access denied. Enable it in browser settings to use dictation.'
        );
      } else if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        toast.error('Dictation error. Please try again.');
      }
    };

    r.onend = () => {
      cleanupTimers();
      setInterim('');
      setElapsed(0);
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = r;
    try {
      r.start();
    } catch {
      toast.error('Could not start dictation. Please try again.');
      return;
    }

    setIsRecording(true);
    setElapsed(0);
    tickRef.current = window.setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);
    armSilence();
  };

  const handleClick = () => {
    if (isRecording) {
      stop();
    } else {
      start();
    }
  };

  if (!supported) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled
                aria-label="Dictation unavailable"
                className="h-7 w-7"
              >
                <Mic className="h-3.5 w-3.5" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            Dictation requires Chrome, Edge, or Safari
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {isRecording && (
          <span className="text-xs tabular-nums text-red-600 font-medium">
            {formatElapsed(elapsed)}
          </span>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleClick}
                aria-label={isRecording ? 'Stop dictation' : 'Start dictation'}
                className="h-7 w-7"
              >
                {isRecording ? (
                  <MicOff className={cn('h-3.5 w-3.5 text-red-600 animate-pulse')} />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              {isRecording ? 'Stop dictation' : 'Start dictation (en-AU)'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {isRecording && interim && (
        <p className="text-xs text-muted-foreground italic max-w-xs truncate">
          {interim}
        </p>
      )}
    </div>
  );
}
