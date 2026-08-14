import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

// Matches the real tag convention (162 tags, lowercase with spaces — see
// normalizeTagValue in useAcademyTagManagement.ts). Previously kebab-cased
// input, which meant even clicking an existing "rto compliance" suggestion
// silently created a near-duplicate "rto-compliance" tag instead of reusing it.
function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "");
}

export function TagChipInput({ value, onChange, suggestions = [], placeholder = "Type a tag and press Enter" }: Props) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = value ?? [];

  const addTag = (raw: string) => {
    const v = normalizeTag(raw);
    if (!v) return;
    if (tags.includes(v)) return;
    onChange([...tags, v]);
    setDraft("");
  };

  const removeTag = (v: string) => onChange(tags.filter((t) => t !== v));

  const filteredSuggestions = suggestions
    .filter((s) => !tags.includes(s))
    .filter((s) => (draft ? s.toLowerCase().includes(draft.toLowerCase()) : true))
    .slice(0, 8);

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1">
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="rounded hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Remove ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          ref={inputRef}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(draft);
            } else if (e.key === "Backspace" && !draft && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            }
          }}
        />
        {open && filteredSuggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-48 overflow-auto">
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TagChipInput;
