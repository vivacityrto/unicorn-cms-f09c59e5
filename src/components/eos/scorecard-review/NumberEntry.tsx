import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseNumberInput } from '@/features/eos-scorecard/scorecardView';

interface NumberEntryProps {
  /** Said to screen readers, e.g. "This week's number for Proposals Sent". */
  label: string;
  unit: string;
  onSave: (value: number) => void;
  saving?: boolean;
  className?: string;
}

const PLACEHOLDER: Record<string, string> = { '%': '%', $: '$' };

/** Type this week's number and save it. Accepts "$1,200" or "12 %"; says so plainly when it can't read it. */
export function NumberEntry({ label, unit, onSave, saving = false, className }: NumberEntryProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = parseNumberInput(text);
    if (value === null) {
      setError(true);
      return;
    }
    setError(false);
    onSave(value);
    setText('');
  };

  return (
    <form onSubmit={submit} className={className} noValidate>
      <div className="flex items-center gap-1.5">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(false);
          }}
          inputMode="decimal"
          aria-label={label}
          aria-invalid={error}
          placeholder={PLACEHOLDER[unit] ?? 'number'}
          className="h-9 w-24"
        />
        <Button type="submit" size="sm" className="h-9" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" /> : 'Save'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          Enter a number, like 12 or 12.5.
        </p>
      )}
    </form>
  );
}
