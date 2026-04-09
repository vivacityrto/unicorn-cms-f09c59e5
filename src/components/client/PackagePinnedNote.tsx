import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Pin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { sanitizeHtml } from '@/lib/sanitize';

interface PackagePinnedNoteProps {
  tenantId: number;
  packageInstanceId: number;
}

interface PinnedNote {
  id: string;
  title: string | null;
  note_details: string;
}

export function PackagePinnedNote({ tenantId, packageInstanceId }: PackagePinnedNoteProps) {
  const [note, setNote] = useState<PinnedNote | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase
      .from('notes')
      .select('id, title, note_details')
      .eq('tenant_id', tenantId)
      .eq('parent_type', 'package_instance')
      .eq('parent_id', packageInstanceId)
      .eq('is_pinned', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setNote(data as PinnedNote);
      });
  }, [tenantId, packageInstanceId]);

  if (!note) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-start gap-2 p-2.5 rounded-lg border border-primary/30 bg-primary/5 text-sm w-full text-left hover:bg-primary/10 transition-colors cursor-pointer"
      >
        <Pin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <span className="font-medium text-primary">Pinned Note: </span>
          <span className="font-medium text-foreground">{note.title || 'Untitled'}</span>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" />
              {note.title || 'Untitled'}
            </DialogTitle>
          </DialogHeader>
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.note_details || '') }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
