import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { lookupTargetRtoByCode, type TargetRtoSnapshot } from '@/lib/tga/lookupTargetRto';

interface TgaRtoLookupRowProps {
  /** Initial RTO Number to seed the input (e.g. value already on the form). */
  initialCode?: string;
  /** Called with the mapped snapshot when TGA returns a match. */
  onResult: (snapshot: TargetRtoSnapshot) => void;
  /** Optional helper line displayed under the row. */
  helperText?: string;
}

/**
 * Compact row: RTO Number input + "Lookup TGA" button.
 * Calls the `tga-rto-preview` edge function and bubbles up the mapped snapshot.
 * Used in the New Audit modal (DD step 3) and the Overview snapshot editor (DD).
 */
export function TgaRtoLookupRow({ initialCode = '', onResult, helperText }: TgaRtoLookupRowProps) {
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);

  const valid = /^\d{4,6}$/.test(code.trim());

  const handleLookup = async () => {
    if (!valid || loading) return;
    setLoading(true);
    const result = await lookupTargetRtoByCode(code.trim());
    setLoading(false);
    if (!result.ok || !result.data) {
      toast.error(result.error || 'TGA lookup failed.');
      return;
    }
    onResult(result.data);
    toast.success(`Loaded ${result.data.rto_name || `RTO ${result.data.rto_number}`} from training.gov.au`);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Lookup Target RTO from training.gov.au</Label>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleLookup();
              }
            }}
            placeholder="RTO Number (e.g. 40888)"
            inputMode="numeric"
          />
        </div>
        <Button
          type="button"
          variant="default"
          onClick={handleLookup}
          disabled={!valid || loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-1.5">{loading ? 'Looking up…' : 'Lookup TGA'}</span>
        </Button>
      </div>
      {code && !valid && (
        <p className="text-[11px] text-destructive">RTO Number must be 4–6 digits.</p>
      )}
      {helperText && (
        <p className="text-[11px] text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
