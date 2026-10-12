import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface DictationControlProps {
  isSupported: boolean;
  /** True while THIS field is being dictated. */
  isListening: boolean;
  /** Words recognised so far in the current phrase, not yet added to the field. */
  interim: string;
  onToggle: () => void;
  /** When provided, shows the "start automatically" switch. */
  autoStart?: boolean;
  onAutoStartChange?: (value: boolean) => void;
  /** When provided, shows the "label with my name" switch (discussion notes only). */
  labelWithName?: boolean;
  onLabelWithNameChange?: (value: boolean) => void;
}

/** Mic toggle + live status that sits above a dictatable text field. */
export function DictationControl({
  isSupported,
  isListening,
  interim,
  onToggle,
  autoStart,
  onAutoStartChange,
  labelWithName,
  onLabelWithNameChange,
}: DictationControlProps) {
  if (!isSupported) {
    return (
      <p className="text-xs text-muted-foreground">
        Voice dictation needs Chrome or Edge. You can still type your notes.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={isListening ? 'destructive' : 'outline'}
            onClick={onToggle}
            aria-pressed={isListening}
            className="gap-1.5"
          >
            {isListening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {isListening ? 'Stop dictating' : 'Dictate'}
          </Button>
          {isListening ? (
            <span className="flex items-center gap-1.5 text-xs text-destructive" role="status">
              <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden />
              Listening - saves automatically
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Types what you say. Hears your microphone only.</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {onLabelWithNameChange && (
            <div className="flex items-center gap-2">
              <Switch id="ids-dictation-label" checked={!!labelWithName} onCheckedChange={onLabelWithNameChange} />
              <Label htmlFor="ids-dictation-label" className="text-xs font-normal text-muted-foreground">
                Label with my name
              </Label>
            </div>
          )}
          {onAutoStartChange && (
            <div className="flex items-center gap-2">
              <Switch id="ids-dictation-autostart" checked={!!autoStart} onCheckedChange={onAutoStartChange} />
              <Label htmlFor="ids-dictation-autostart" className="text-xs font-normal text-muted-foreground">
                Start dictating automatically
              </Label>
            </div>
          )}
        </div>
      </div>
      {isListening && interim && (
        <p className="text-xs italic text-muted-foreground" aria-live="polite">
          {interim}…
        </p>
      )}
    </div>
  );
}
