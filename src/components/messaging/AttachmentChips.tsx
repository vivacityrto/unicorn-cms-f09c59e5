import { Button } from "@/components/ui/button";
import { X, Paperclip } from "lucide-react";
import { formatBytes } from "@/lib/messageAttachments";

interface Props {
  files: File[];
  onRemove: (index: number) => void;
}

export function AttachmentChips({ files, onRemove }: Props) {
  if (!files.length) return null;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-1.5 mb-2 overflow-hidden">
      {files.map((f, i) => (
        <div
          key={`${f.name}-${i}`}
          className="inline-flex max-w-full min-w-0 items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-xs border border-border"
        >
          <Paperclip className="h-3 w-3 text-muted-foreground" />
          <span className="truncate max-w-[180px]">{f.name}</span>
          <span className="text-muted-foreground">({formatBytes(f.size)})</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(i)}
            className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label={`Remove ${f.name}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
