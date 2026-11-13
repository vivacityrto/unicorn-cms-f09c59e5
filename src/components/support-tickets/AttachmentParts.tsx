import { useRef } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAttachmentUrl, validateAttachment, type ThreadAttachment } from './useTicketThread';

/** Choose files to attach. Rejects anything the bucket would refuse, with a plain-language reason. */
export function AttachmentPicker({
  files, onChange, disabled, maxFiles = 5, maxBytes, accept = 'image/*,application/pdf,text/plain',
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  maxBytes?: number;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = validateAttachment(f, maxBytes);
      if (problem) { toast.error(`${f.name}: ${problem}`); continue; }
      if (next.length >= maxFiles) { toast.error(`You can attach up to ${maxFiles} files.`); break; }
      next.push(f);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple={maxFiles > 1}
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => add(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 gap-1.5 text-foreground sm:min-h-9"
        disabled={disabled || files.length >= maxFiles}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip aria-hidden className="h-4 w-4" />
        Attach a file
      </Button>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Files to attach">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground">
              <FileText aria-hidden className="h-3.5 w-3.5" />
              <span className="max-w-[12rem] truncate">{f.name}</span>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`Remove ${f.name}`}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One saved attachment: image thumbnail or file link, using a short-lived signed URL. */
export function AttachmentItem({ attachment }: { attachment: ThreadAttachment }) {
  const isImage = (attachment.mime_type ?? '').startsWith('image/');
  const { data: url } = useAttachmentUrl(attachment);
  if (!url) {
    return <span className="text-xs text-muted-foreground">{attachment.file_name}</span>;
  }
  return isImage ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img src={url} alt={attachment.file_name} className="max-h-40 rounded-md border border-border object-contain" loading="lazy" />
    </a>
  ) : (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground underline-offset-2 hover:underline"
    >
      <FileText aria-hidden className="h-3.5 w-3.5" />
      {attachment.file_name}
    </a>
  );
}

export function AttachmentList({ attachments }: { attachments: ThreadAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) => <AttachmentItem key={a.id} attachment={a} />)}
    </div>
  );
}
