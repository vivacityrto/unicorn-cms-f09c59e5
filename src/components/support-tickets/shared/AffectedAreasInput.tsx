import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';

const SUGGESTIONS = [
  'All clients',
  'Dashboard',
  'Clients',
  'Work',
  'EOS',
  'Academy',
  'Administration',
  'Resource Management',
];

interface Props {
  value: string[];
  onChange: (next: string[] | null) => void;
}

export function AffectedAreasInput({ value, onChange }: Props) {
  const [input, setInput] = useState('');
  const tags = value ?? [];

  const add = (tag: string) => {
    const t = tag.trim();
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    onChange(next);
    setInput('');
  };

  const remove = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    onChange(next.length ? next : null);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(input);
            }
          }}
          placeholder="Type an area and press Enter"
        />
        <Button type="button" variant="outline" onClick={() => add(input)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              {t}
              <button type="button" onClick={() => remove(t)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.filter((s) => !tags.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            className="text-xs px-2 py-1 rounded border border-dashed text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}
